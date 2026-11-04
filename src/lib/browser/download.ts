/** Saves text as a file through the browser download. */
export function downloadText(fileName: string, text: string, type = 'application/json'): void {
	const url = URL.createObjectURL(new Blob([text], { type }));
	const link = document.createElement('a');
	link.href = url;
	link.download = fileName;
	link.click();
	setTimeout(() => URL.revokeObjectURL(url), 1000);
}
