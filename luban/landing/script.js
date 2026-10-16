const examples = [
  { prompt: 'Collect the titles and links of these articles into a table.', response: "Let's put your reading list together.", name: 'Article collector', description: 'Finds article titles and links on this page.', result: '✓ 2 article links collected in the preview.', action: 'Download reading list ↓' },
  { prompt: 'Hide the navigation and distractions so I can focus on reading.', response: "A little breathing room, coming right up.", name: 'Focus mode', description: 'Hides navigation for a calmer reading view.', result: '✓ Focus mode is on in the preview.', action: 'Restore original view ↺' },
  { prompt: 'Add a button to copy all article titles in one click.', response: "Let's make that a one-click task.", name: 'Quick-copy titles', description: 'Copies the article titles to your clipboard.', result: '✓ Your quick-copy tool is ready.', action: 'Copy article titles ⧉' }
];
let selected = 0;
let ran = false;
const result = document.querySelector('#demo-result');
const run = document.querySelector('#run-demo');
function selectDemo(index) {
  selected = index; ran = false;
  const example = examples[index];
  document.querySelectorAll('[data-demo]').forEach((tab, i) => { tab.setAttribute('aria-selected', String(i === index)); tab.tabIndex = i === index ? 0 : -1; });
  document.querySelector('#demo-prompt').textContent = example.prompt;
  document.querySelector('#demo-response').textContent = example.response;
  document.querySelector('#tool-name').textContent = example.name;
  document.querySelector('#tool-description').textContent = example.description;
  run.textContent = '▷  Try it on this page'; result.hidden = true;
  document.querySelector('.selection-outline').hidden = index !== 0;
  document.querySelector('.mock-nav').style.visibility = 'visible';
  document.querySelector('.site-result').hidden = true;
}
document.querySelectorAll('[data-demo]').forEach(tab => {
  tab.addEventListener('click', () => selectDemo(Number(tab.dataset.demo)));
  tab.addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const index = event.key === 'Home' ? 0 : event.key === 'End' ? 2 : (selected + (event.key === 'ArrowRight' ? 1 : 2)) % 3;
    selectDemo(index); document.querySelector(`[data-demo="${index}"]`).focus();
  });
});
document.querySelectorAll('[data-example]').forEach(button => button.addEventListener('click', () => { selectDemo(Number(button.dataset.example)); document.querySelector('#demo').scrollIntoView({ behavior: 'smooth' }); }));
run.addEventListener('click', async () => {
  if (!ran) {
    ran = true; result.hidden = false; result.textContent = examples[selected].result; run.textContent = examples[selected].action;
    if (selected === 1) { document.querySelector('.mock-nav').style.visibility = 'hidden'; document.querySelector('.site-result').hidden = false; }
    return;
  }
  if (selected === 0) {
    const blob = new Blob(['Title,URL\nMaking room for what matters,https://example.com/less\nA better kind of everyday,https://example.com/everyday\n'], { type: 'text/csv;charset=utf-8' });
    const link = document.createElement('a'); const url = URL.createObjectURL(blob); link.href = url; link.download = 'luban-demo-reading-list.csv'; link.click(); URL.revokeObjectURL(url); result.textContent = '✓ Illustrative reading list downloaded.';
  } else if (selected === 1) { selectDemo(1); }
  else { try { await navigator.clipboard.writeText('Making room for what matters\nA better kind of everyday'); result.textContent = '✓ Article titles copied.'; } catch { result.textContent = 'Clipboard unavailable. Titles: Making room for what matters; A better kind of everyday.'; } }
});
const dialog = document.querySelector('#install-dialog');
document.querySelectorAll('[data-install]').forEach(button => button.addEventListener('click', () => dialog.showModal()));
document.querySelector('.close-dialog').addEventListener('click', () => dialog.close());
dialog.addEventListener('click', event => { if (event.target === dialog) { const rect = dialog.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close(); } });
document.querySelector('#copy-address').addEventListener('click', async () => { try { await navigator.clipboard.writeText('chrome://extensions'); document.querySelector('.copy-status').textContent = 'Copied. Paste the address into a new Chrome tab.'; } catch { document.querySelector('.copy-status').textContent = 'Open a new Chrome tab and enter chrome://extensions.'; } });
selectDemo(0);
const currentEdition = location.pathname.split('/').pop() || 'index.html';
document.querySelectorAll('.version-switch a').forEach(link => {
  if (link.getAttribute('href') === currentEdition) link.setAttribute('aria-current', 'page');
});
