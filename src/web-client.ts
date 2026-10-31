export const webClientScript = String.raw`
(() => {
  const pageSize = 20;
  const filters = new Map();
  let refreshing = false;
  let requesting = false;
  let lastMarkup = document.getElementById('live-content').innerHTML;

  function notice(message, error = false) {
    const status = document.getElementById('request-status');
    status.textContent = message;
    status.className = error ? 'notice error' : 'notice';
    status.hidden = !message;
  }

  function applyLists() {
    document.querySelectorAll('[data-list]').forEach(section => {
      const key = section.dataset.list;
      const filter = filters.get(key) || { query: '', status: 'all', page: 0 };
      filters.set(key, filter);
      const search = section.querySelector('[data-search-filter]');
      const status = section.querySelector('[data-status-filter]');
      if (search) search.value = filter.query;
      if (status) status.value = filter.status;
      const entries = [...section.querySelectorAll('[data-entry]')];
      const matching = entries.filter(entry => {
        const active = ['pending', 'delivered', 'awaiting_approval'].includes(entry.dataset.status);
        return (!filter.query || entry.dataset.search?.includes(filter.query.toLowerCase())) &&
          (filter.status === 'all' || (filter.status === 'active' ? active : entry.dataset.status === filter.status));
      });
      filter.page = Math.min(filter.page, Math.max(0, Math.ceil(matching.length / pageSize) - 1));
      entries.forEach(entry => { entry.hidden = true; });
      matching.slice(filter.page * pageSize, (filter.page + 1) * pageSize).forEach(entry => { entry.hidden = false; });
      section.querySelector('[data-list-empty]').hidden = matching.length > 0;
      section.querySelector('[data-page-label]').textContent = matching.length ?
        (filter.page * pageSize + 1) + '–' + Math.min((filter.page + 1) * pageSize, matching.length) + ' of ' + matching.length : '0 entries';
      section.querySelector('[data-page="previous"]').disabled = filter.page === 0;
      section.querySelector('[data-page="next"]').disabled = (filter.page + 1) * pageSize >= matching.length;
    });
  }

  async function refreshView() {
    if (refreshing || requesting || document.hidden || document.activeElement?.matches('input,select')) return;
    refreshing = true;
    try {
      const response = await fetch(location.pathname, { cache: 'no-store' });
      if (!response.ok) throw new Error();
      const next = new DOMParser().parseFromString(await response.text(), 'text/html').getElementById('live-content');
      if (!next) throw new Error();
      if (!requesting && next.innerHTML !== lastMarkup) {
        const scrollTop = window.scrollY;
        lastMarkup = next.innerHTML;
        document.getElementById('live-content').innerHTML = lastMarkup;
        applyLists();
        window.scrollTo(0, scrollTop);
      }
      document.getElementById('connection-status').hidden = true;
    } catch {
      const status = document.getElementById('connection-status');
      status.textContent = 'Could not refresh this page. Showing the last available data; retrying automatically.';
      status.className = 'notice error';
      status.hidden = false;
    } finally { refreshing = false; }
  }

  document.addEventListener('input', event => {
    if (!event.target.matches('[data-search-filter]')) return;
    const filter = filters.get(event.target.closest('[data-list]').dataset.list);
    filter.query = event.target.value;
    filter.page = 0;
    applyLists();
  });
  document.addEventListener('change', event => {
    if (!event.target.matches('[data-status-filter]')) return;
    const filter = filters.get(event.target.closest('[data-list]').dataset.list);
    filter.status = event.target.value;
    filter.page = 0;
    applyLists();
  });
  document.addEventListener('click', async event => {
    const button = event.target.closest('button');
    if (!button || button.disabled) return;
    if (button.dataset.page) {
      const filter = filters.get(button.closest('[data-list]').dataset.list);
      filter.page += button.dataset.page === 'next' ? 1 : -1;
      applyLists();
      return;
    }
    if (requesting) return;
    if (button.hasAttribute('data-pair')) {
      requesting = true;
      button.disabled = true;
      try {
        const response = await fetch('/api/pairing-codes', { method: 'POST' });
        if (!response.ok) throw new Error();
        document.getElementById('pairing-code').textContent = (await response.json()).pairingCode.code;
        document.getElementById('pairing-card').hidden = false;
        notice('Enter the pairing code in your Android agent.');
      } catch { notice('Could not create a pairing code. Try again.', true); }
      finally { button.disabled = false; requesting = false; }
      return;
    }
    const type = button.dataset.action;
    if (!type) return;
    if (type.startsWith('remove') && !window.confirm('Request removal of ' + button.dataset.name + '? Approval is required on the device.')) return;
    const body = { type };
    if (type === 'removeApplication') body.payload = { applicationId: button.dataset.target, expectedVersionCode: Number(button.dataset.revision) };
    if (type === 'removeFile') body.payload = { fileId: button.dataset.target, expectedRevision: button.dataset.revision };
    const originalLabel = button.textContent;
    requesting = true;
    button.disabled = true;
    button.textContent = 'Requesting…';
    try {
      const response = await fetch('/api/devices/' + encodeURIComponent(document.body.dataset.deviceId) + '/actions', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
      });
      if (!response.ok) throw new Error();
      notice('Request recorded. Follow its progress in Pending actions and History.');
    } catch {
      button.disabled = false;
      button.textContent = originalLabel;
      notice('Could not confirm the request. Check Pending actions and History before retrying.', true);
    } finally { requesting = false; }
    await refreshView();
  });
  applyLists();
  setInterval(refreshView, 5000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshView(); });
})();
`;
