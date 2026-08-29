package com.vaultx.VaultX.service;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDDocumentInformation;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.font.PDFont;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import org.apache.pdfbox.pdmodel.graphics.state.PDExtendedGraphicsState;
import org.springframework.stereotype.Service;

import java.io.ByteArrayOutputStream;
import java.io.IOException;

@Service
public class WatermarkService {

    public byte[] applyWatermarkAndMetadata(byte[] originalPdfBytes, String watermarkText, String copyId, String fingerprint, Long shareId) throws IOException {
        try (PDDocument document = Loader.loadPDF(originalPdfBytes)) {

            // 1. Inject custom metadata into Document Information
            PDDocumentInformation info = document.getDocumentInformation();
            info.setCustomMetadataValue("VaultX-Copy-ID", copyId);
            info.setCustomMetadataValue("VaultX-Fingerprint", fingerprint);
            info.setCustomMetadataValue("VaultX-Share-ID", String.valueOf(shareId));

            // 2. Add visible watermark to every page
            PDFont font = new PDType1Font(Standard14Fonts.FontName.HELVETICA_BOLD);

            for (PDPage page : document.getPages()) {
                float pageWidth = page.getMediaBox().getWidth();
                float pageHeight = page.getMediaBox().getHeight();

                try (PDPageContentStream contentStream = new PDPageContentStream(
                        document,
                        page,
                        PDPageContentStream.AppendMode.APPEND,
                        true,
                        true
                )) {
                    // Set semi-transparent graphics state
                    PDExtendedGraphicsState graphicsState = new PDExtendedGraphicsState();
                    graphicsState.setNonStrokingAlphaConstant(0.4f);
                    contentStream.setGraphicsStateParameters(graphicsState);

                    // Configure text
                    contentStream.beginText();
                    contentStream.setFont(font, 10);
                    contentStream.setNonStrokingColor(0.7f, 0.0f, 0.0f); // Dark red watermark

                    // Position near bottom right
                    float margin = 20;
                    float stringWidth = font.getStringWidth(watermarkText) / 1000 * 10;
                    float x = Math.max(margin, pageWidth - stringWidth - margin);
                    float y = margin;

                    contentStream.newLineAtOffset(x, y);
                    contentStream.showText(watermarkText);
                    contentStream.endText();
                }
            }

            ByteArrayOutputStream outputStream = new ByteArrayOutputStream();
            document.save(outputStream);
            return outputStream.toByteArray();
        }
    }
}
