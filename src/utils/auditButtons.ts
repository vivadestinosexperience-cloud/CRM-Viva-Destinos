/**
 * Simple audit function to find potential UI issues with buttons.
 * Used in development mode only.
 */
export function auditButtons() {
  if (process.env.NODE_ENV !== 'development') return;

  const buttons = document.querySelectorAll('button');
  buttons.forEach((btn, index) => {
    const hasOnClick = !!btn.onclick || btn.hasAttribute('onclick');
    // Using a more heuristic approach for React-managed buttons
    // Since we can't easily check React's event handlers from the DOM,
    // we'll look for common issues like empty href or missing type.
    
    const isInsideForm = btn.closest('form');
    const type = btn.getAttribute('type');
    
    if (!type && !isInsideForm) {
      console.warn(`[Audit] Button #${index} might be missing 'type="button"':`, btn);
    }

    // Checking for "#" href in links that should be buttons
    const links = document.querySelectorAll('a[href="#"]');
    links.forEach(link => {
      console.error('[Audit] Link with href="#" found. Use a button or real route:', link);
    });
  });
}
