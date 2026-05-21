#![no_std]
use soroban_sdk::{contract, contractimpl, contracttype, token, Address, Env, Symbol};

#[contracttype]
pub enum DataKey {
    Admin,
    MerchantLockDuration(Address),
    LockedContingency(Address),
}

#[contracttype]
#[derive(Clone, Default)]
pub struct LockedContingency {
    pub amount: i128,
    pub unlock_timestamp: u64,
}

#[contract]
pub struct InvoicePaymentContract;

#[contractimpl]
impl InvoicePaymentContract {
    pub fn init(env: Env, admin: Address) {
        admin.require_auth();
        env.storage().instance().set(&DataKey::Admin, &admin);
    }

    pub fn set_merchant_lock_duration(env: Env, merchant: Address, lock_duration_seconds: u64) {
        merchant.require_auth();
        env.storage()
            .instance()
            .set(&DataKey::MerchantLockDuration(merchant), &lock_duration_seconds);
    }

    pub fn pay_invoice(
        env: Env,
        customer: Address,
        merchant: Address,
        token: Address,
        amount: i128,
        contingency_percentage: i128,
    ) {
        customer.require_auth();

        if amount <= 0 {
            panic!("amount must be positive");
        }

        if contingency_percentage < 0 || contingency_percentage > 100 {
            panic!("contingency_percentage must be between 0 and 100");
        }

        let contract_address = env.current_contract_address();
        let token_client = token::Client::new(&env, &token);

        token_client.transfer_from(
            &customer,
            &customer,
            &contract_address,
            &amount,
        );

        let contingency_amount = amount * contingency_percentage / 100;
        let merchant_share = amount - contingency_amount;

        if merchant_share > 0 {
            token_client.transfer(&contract_address, &merchant, &merchant_share);
        }

        let now = env.ledger().timestamp();
        let lock_duration = env
            .storage()
            .instance()
            .get(&DataKey::MerchantLockDuration(merchant.clone()))
            .unwrap_or(30 * 24 * 60 * 60u64);
        let unlock_timestamp = now + lock_duration;

        let mut stored: LockedContingency = env
            .storage()
            .instance()
            .get(&DataKey::LockedContingency(merchant.clone()))
            .unwrap_or_default();
        stored.amount += contingency_amount;
        stored.unlock_timestamp = unlock_timestamp;
        env.storage().instance().set(&DataKey::LockedContingency(merchant.clone()), &stored);

        env.events().publish(
            (Symbol::new(&env, "invoice_paid"), &merchant),
            (customer, merchant, amount, contingency_amount, unlock_timestamp),
        );
    }

    pub fn withdraw_contingency(env: Env, merchant: Address, token: Address) {
        merchant.require_auth();

        let mut locked: LockedContingency = env
            .storage()
            .instance()
            .get(&DataKey::LockedContingency(merchant.clone()))
            .unwrap_or_default();

        let now = env.ledger().timestamp();
        if locked.amount <= 0 {
            panic!("no contingency funds available");
        }
        if now < locked.unlock_timestamp {
            panic!("contingency funds are still locked");
        }

        let payout_amount = locked.amount;
        locked.amount = 0;
        env.storage().instance().set(&DataKey::LockedContingency(merchant.clone()), &locked);

        let contract_address = env.current_contract_address();
        let token_client = token::Client::new(&env, &token);
        token_client.transfer(&contract_address, &merchant, &payout_amount);

        env.events().publish(
            (Symbol::new(&env, "contingency_withdrawn"), &merchant),
            (payout_amount, now),
        );
    }

    pub fn get_locked_contingency(env: Env, merchant: Address) -> LockedContingency {
        env.storage()
            .instance()
            .get(&DataKey::LockedContingency(merchant))
            .unwrap_or_default()
    }

    pub fn get_lock_duration(env: Env, merchant: Address) -> u64 {
        env.storage()
            .instance()
            .get(&DataKey::MerchantLockDuration(merchant))
            .unwrap_or(30 * 24 * 60 * 60u64)
    }
}
