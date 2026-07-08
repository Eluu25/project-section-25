import api from './api';

export const downloadBlob = (blob, filename) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || 'document';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};

export const filenameFromDisposition = (contentDisposition, fallback) => {
  const match = /filename\*?=(?:UTF-8''|")?([^";\n]+)/i.exec(contentDisposition || '');
  return match?.[1]?.replace(/"/g, '') || fallback;
};

export async function downloadDocumentById(documentId, fallbackName = 'document') {
  const { blob, contentDisposition } = await api.downloadDocument(documentId);
  const name = filenameFromDisposition(contentDisposition, fallbackName);
  downloadBlob(blob, name);
}

export async function openDocumentById(documentId) {
  const { blob } = await api.downloadDocument(documentId);
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank', 'noopener,noreferrer');
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
