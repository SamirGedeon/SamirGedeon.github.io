/* Apply the saved theme before the stylesheet paints. No inline JavaScript is required. */
try { document.documentElement.dataset.theme = localStorage.getItem('samir-theme') === 'dark' ? 'dark' : localStorage.getItem('samir-theme') === 'light' ? 'light' : matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'; }
  catch { document.documentElement.dataset.theme = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'; }
