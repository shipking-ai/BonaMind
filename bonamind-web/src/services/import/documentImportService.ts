import JSZip from 'jszip';
import { extractTextFromPdf } from './pdfService';

const decodeXml = (value: string) =>
  value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");

const cleanSlideText = (value: string) =>
  decodeXml(value)
    .replace(/<a:br\s*\/>/g, '\n')
    .replace(/<\/a:p>/g, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();

export const extractTextFromPptx = async (file: File): Promise<string> => {
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const slideFiles = Object.keys(zip.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/i.test(name))
    .sort((a, b) => {
      const aNum = Number((a.match(/slide(\d+)\.xml/i) || [])[1] || 0);
      const bNum = Number((b.match(/slide(\d+)\.xml/i) || [])[1] || 0);
      return aNum - bNum;
    });

  if (!slideFiles.length) {
    throw new Error('No slide XML files found in this PowerPoint.');
  }

  const slideTexts: string[] = [];
  for (const path of slideFiles) {
    const xml = await zip.file(path)?.async('text');
    if (!xml) continue;
    const cleaned = cleanSlideText(xml);
    if (cleaned) slideTexts.push(cleaned);
  }

  if (!slideTexts.length) {
    throw new Error('No readable text found in this PowerPoint.');
  }

  return slideTexts.join('\n\n');
};

export const extractStudyAssetText = async (file: File): Promise<string> => {
  const fileName = file.name.toLowerCase();
  if (file.type === 'application/pdf' || fileName.endsWith('.pdf')) {
    return extractTextFromPdf(file);
  }

  if (
    file.type === 'application/vnd.openxmlformats-officedocument.presentationml.presentation' ||
    fileName.endsWith('.pptx')
  ) {
    return extractTextFromPptx(file);
  }

  if (fileName.endsWith('.ppt')) {
    throw new Error('Legacy .ppt is not supported for direct parsing. Save as .pptx and try again.');
  }

  return file.text();
};



