# Third-party notices (backend)

Notices for the libraries added for the image pack (roadmap item 3) and the
priced roadmap's Word SOW appendix (P1). Each
licence is taken from the package's own metadata. Other dependencies are
listed in `requirements.txt`.

| Package | Version | Licence | Used for |
|---------|---------|---------|----------|
| pypdfium2 | 4.30.0 | Apache-2.0 OR BSD-3-Clause, and PDFium's third-party licences (below) | Rasterising rendered visuals to PNG / JPEG |
| PDFium (bundled in the pypdfium2 wheel) | as bundled | Apache-2.0 OR BSD-3-Clause, and LicenseRef-PdfiumThirdParty | PDF rendering engine |
| python-pptx | 1.0.2 | MIT | Building the PowerPoint file |
| lxml (python-pptx and python-docx dependency) | 6.1.3 | BSD-3-Clause | |
| XlsxWriter (python-pptx dependency) | 3.2.9 | BSD-2-Clause | |
| python-docx | 1.1.2 | MIT | The editable Word SOW appendix (priced roadmap) |
| typing_extensions (python-docx dependency) | as installed | PSF-2.0 | |
| Pillow (already used by WeasyPrint) | as installed | MIT-CMU | Image cropping and encoding |

## PDFium third-party components

The PDFium binary in the pypdfium2 wheel includes code from libpng,
LibTIFF, Anti-Grain Geometry 2.3, FreeType, Little CMS, OpenJPEG, zlib,
libjpeg-turbo, the Independent JPEG Group's software, and ICU. Their
licence texts are reproduced, as shipped in the wheel, in
[licenses/pdfium-third-party.txt](licenses/pdfium-third-party.txt).
