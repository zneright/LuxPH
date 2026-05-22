import { useState } from "react";
import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";

interface UseExportPDFOptions {
    elementId: string;
    fileName: string;
}

export const useExportPDF = () => {
    const [isGeneratingPdf, setIsGeneratingPdf] = useState<boolean>(false);

    const downloadPDF = async ({ elementId, fileName }: UseExportPDFOptions) => {
        const element = document.getElementById(elementId);
        if (!element) {
            console.warn(`Element with id ${elementId} not found.`);
            return;
        }

        setIsGeneratingPdf(true);
        try {
            // Allow fonts to fully render before screenshotting
            await document.fonts.ready;

            const canvas = await html2canvas(element, {
                scale: 2,
                useCORS: true,
                backgroundColor: "#ffffff",
                logging: false,
            });

            const imgData = canvas.toDataURL("image/png");

            const pdf = new jsPDF({
                orientation: "portrait",
                unit: "mm",
                format: "a4",
            });

            const pdfWidth = pdf.internal.pageSize.getWidth();
            const pdfHeight = (canvas.height * pdfWidth) / canvas.width;

            pdf.addImage(imgData, "PNG", 0, 10, pdfWidth, pdfHeight);
            pdf.save(fileName);
        } catch (error) {
            console.error("Failed to generate PDF:", error);
            alert("Failed to generate PDF. Check console for details.");
        } finally {
            setIsGeneratingPdf(false);
        }
    };

    return { downloadPDF, isGeneratingPdf };
};