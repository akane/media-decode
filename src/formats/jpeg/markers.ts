// Table B.1 Marker code assignments
// All markers shall be assigned two-byte codes: 0xFF followed by a second byte which is not equal to 0 or 0xFF.
export const enum MarkerCode {
  // Start Of Frame markers, non-differential, Huffman coding
  SOF0 = 0xFFC0, // Baseline DCT
  SOF1 = 0xFFC1, // Extended sequential DCT
  SOF2 = 0xFFC2, // Progressive DCT
  SOF3 = 0xFFC3, // Lossless (sequential)
  // Start Of Frame markers, differential, Huffman coding
  SOF5 = 0xFFC5, // Differential sequential DCT
  SOF6 = 0xFFC6, // Differential progressive DCT
  SOF7 = 0xFFC7, // Differential lossless (sequential)
  // Start Of Frame markers, non-differential, arithmetic coding
  JPG = 0xFFC8, // Reserved for JPEG extensions
  SOF9 = 0xFFC9, // Extended sequential DCT
  SOF10 = 0xFFCA, // Progressive DCT
  SOF11 = 0xFFCB, // Lossless (sequential)
  // Start Of Frame markers, differential, arithmetic coding
  SOF13 = 0xFFCD, // Differential sequential DCT
  SOF14 = 0xFFCE, // Differential progressive DCT
  SOF15 = 0xFFCF, // Differential lossless (sequential)
  // Huffman table specification
  DHT = 0xFFC4, // Define Huffman table(s)
  // Arithmetic coding conditioning specification
  DAC = 0xFFCC, // Define arithmetic coding conditioning(s)
  // Restart interval termination
  RST0 = 0xFFD0, // Restart with modulo 8 count “0”
  RST1 = 0xFFD1, // Restart with modulo 8 count “1”
  RST2 = 0xFFD2, // Restart with modulo 8 count “2”
  RST3 = 0xFFD3, // Restart with modulo 8 count “3”
  RST4 = 0xFFD4, // Restart with modulo 8 count “4”
  RST5 = 0xFFD5, // Restart with modulo 8 count “5”
  RST6 = 0xFFD6, // Restart with modulo 8 count “6”
  RST7 = 0xFFD7, // Restart with modulo 8 count “7”
  // Other markers
  SOI = 0xFFD8, // Start of image
  EOI = 0xFFD9, // End of image
  SOS = 0xFFDA, // Start of scan
  DQT = 0xFFDB, // Define quantization table(s)
  DNL = 0xFFDC, // Define number of lines
  DRI = 0xFFDD, // Define restart interval
  DHP = 0xFFDE, // Define hierarchical progression
  EXP = 0xFFDF, // Expand reference component(s)
  // Application segments
  APP0 = 0xFFE0, // Reserved for application segments
  APP1 = 0xFFE1, // Reserved for application segments
  APP2 = 0xFFE2, // Reserved for application segments
  APP3 = 0xFFE3, // Reserved for application segments
  APP4 = 0xFFE4, // Reserved for application segments
  APP5 = 0xFFE5, // Reserved for application segments
  APP6 = 0xFFE6, // Reserved for application segments
  APP7 = 0xFFE7, // Reserved for application segments
  APP8 = 0xFFE8, // Reserved for application segments
  APP9 = 0xFFE9, // Reserved for application segments
  APP10 = 0xFFEA, // Reserved for application segments
  APP11 = 0xFFEB, // Reserved for application segments
  APP12 = 0xFFEC, // Reserved for application segments
  APP13 = 0xFFED, // Reserved for application segments
  APP14 = 0xFFEE, // Reserved for application segments
  APP15 = 0xFFEF, // Reserved for application segments
  JPG0 = 0xFFF0, // Reserved for JPEG extensions
  JPG1 = 0xFFF1, // Reserved for JPEG extensions
  JPG2 = 0xFFF2, // Reserved for JPEG extensions
  JPG3 = 0xFFF3, // Reserved for JPEG extensions
  JPG4 = 0xFFF4, // Reserved for JPEG extensions
  JPG5 = 0xFFF5, // Reserved for JPEG extensions
  JPG6 = 0xFFF6, // Reserved for JPEG extensions
  JPG7 = 0xFFF7, // Reserved for JPEG extensions
  JPG8 = 0xFFF8, // Reserved for JPEG extensions
  JPG9 = 0xFFF9, // Reserved for JPEG extensions
  JPG10 = 0xFFFA, // Reserved for JPEG extensions
  JPG11 = 0xFFFB, // Reserved for JPEG extensions
  JPG12 = 0xFFFC, // Reserved for JPEG extensions
  JPG13 = 0xFFFD, // Reserved for JPEG extensions
  COM = 0xFFFE, // Comment
  // Reserved markers
  TEM = 0xFF01, // For temporary private use in arithmetic coding
  // 0xFF02..0xFFBF // Reserved
}
