import Foundation
import PDFKit

guard CommandLine.arguments.count == 2 else {
  fputs("Usage: extract_pdf_text <pdf-path>\n", stderr)
  exit(2)
}

let url = URL(fileURLWithPath: CommandLine.arguments[1])

guard let document = PDFDocument(url: url) else {
  fputs("Could not open PDF: \(url.path)\n", stderr)
  exit(1)
}

print(document.string ?? "")
