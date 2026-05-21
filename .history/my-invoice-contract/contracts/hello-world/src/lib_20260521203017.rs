#![no_std]
use soroban_sdk::{contract, contractimpl, contracttype, Env, String, Symbol};

// Define the keys used to store data in the contract's instance storage
#[contracttype]
pub enum DataKey {
    Admin,
    InvoiceCount,
}

#[contract]
pub struct InvoiceContract;

#[contractimpl]
impl InvoiceContract {
    /// 1. The Initialization Function
    /// Call this ONCE immediately after deploying the contract.
    /// This sets up the storage so subsequent calls don't hit the "MissingValue" error.
    pub fn init(env: Env, admin: String) {
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::InvoiceCount, &0u32);
    }

    /// 2. The Primary Function called by your React frontend
    /// Note: `amount` is now an `i128` (Stellar stroops), NOT a String float.
    pub fn record_invoice(
        env: Env,
        customer_name: String,
        amount: i128, 
        token: String,
        memo: String,
    ) -> u32 {
        // FIX: Safely retrieve the invoice count without panicking.
        // If the contract was never initialized, it defaults to 0 instead of throwing a HostError.
        let mut count: u32 = env
            .storage()
            .instance()
            .get(&DataKey::InvoiceCount)
            .unwrap_or(0);

        // Increment the invoice counter
        count += 1;

        // Save the new count back to the contract's instance storage
        env.storage().instance().set(&DataKey::InvoiceCount, &count);

        // Emit an event. Your frontend Horizon stream can listen for this exact event.
        env.events().publish(
            (Symbol::new(&env, "invoice_recorded"), memo.clone()),
            (customer_name, amount, token),
        );

        // Return the new invoice ID number
        count
    }
}