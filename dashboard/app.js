// Launch radar dashboard.
//
// Reads the snapshot the build step drops on window.RADAR:
//   { as_of, watchlist_size, rows }
// Every row describes one protocol that records no token yet:
// rank, slug, name, category, chains, tvl_usd, change_7d, mcap_usd,
// listed_at, gecko_id, symbol, token_status, implied_value_usd,
// derivation, farm_steps.
//
// The page renders a ranked board with text / category / chain filters,
// click-to-sort headers, and a detail panel for the selected protocol.
(function () {
  'use strict';

  var data = window.RADAR;
  var rows = data.rows || [];

  // ---- tiny DOM + formatting helpers ----

  function $(selector) {
    return document.querySelector(selector);
  }

  function $all(selector) {
    return document.querySelectorAll(selector);
  }

  function formatDollars(value) {
    var amount = Number(value || 0);
    return '$' + amount.toLocaleString('en-US', { maximumFractionDigits: 0 });
  }

  function formatPercent(value) {
    if (value == null) return '—';
    var sign = value > 0 ? '+' : '';
    return sign + value.toFixed(2) + '%';
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, function (ch) {
      return {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
      }[ch];
    });
  }

  // ---- header stats ----

  function renderHeader() {
    $('#asof').textContent = 'SNAPSHOT · ' + data.as_of;
    $('#total').textContent = rows.length.toLocaleString();
    $('#coverage').textContent = data.watchlist_size + ' / ' + data.watchlist_size;
  }

  // ---- filter dropdowns ----

  function uniqueSorted(values) {
    return [...new Set(values.filter(Boolean))].sort();
  }

  function fillSelect(element, values) {
    values.forEach(function (value) {
      var option = document.createElement('option');
      option.value = value;
      option.textContent = value;
      element.append(option);
    });
  }

  function buildFilters() {
    var categories = uniqueSorted(rows.map(function (row) { return row.category; }));
    var chains = uniqueSorted(rows.flatMap(function (row) { return row.chains || []; }));
    fillSelect($('#category'), categories);
    fillSelect($('#chain'), chains);
  }

  // ---- sorting ----

  var sortKey = 'rank';
  var sortDirection = 1;

  function compareRows(a, b) {
    var left = a[sortKey] == null ? -Infinity : a[sortKey];
    var right = b[sortKey] == null ? -Infinity : b[sortKey];
    return (left - right) * sortDirection;
  }

  // The three protocols with the largest implied value earn a small badge
  // in the board, whichever way the table is sorted.
  var topThree = new Set(
    rows
      .slice()
      .sort(function (a, b) { return (b.implied_value_usd || 0) - (a.implied_value_usd || 0); })
      .slice(0, 3)
      .map(function (row) { return row.slug; })
  );

  // ---- board ----

  function rowMatches(row, query, category, chain) {
    var haystack = (row.name + ' ' + row.slug + ' ' + row.category + ' ' + row.chains.join(' ')).toLowerCase();
    if (query && !haystack.includes(query)) return false;
    if (category && row.category !== category) return false;
    if (chain && !row.chains.includes(chain)) return false;
    return true;
  }

  function rowHtml(row) {
    var badge = topThree.has(row.slug)
      ? ' <span class="badge" title="Top 3 by implied value">TOP 3</span>'
      : '';
    return (
      '<tr data-slug="' + escapeHtml(row.slug) + '">' +
      '<td>' + row.rank + '</td>' +
      '<td><b>' + escapeHtml(row.name) + '</b>' + badge + '<br><small>' + escapeHtml(row.slug) + '</small></td>' +
      '<td>' + escapeHtml(row.category || 'Other') + '</td>' +
      '<td>' + formatDollars(row.tvl_usd) + '</td>' +
      '<td>' + formatPercent(row.change_7d) + '</td>' +
      '<td class="value">' + formatDollars(row.implied_value_usd) + '</td>' +
      '</tr>'
    );
  }

  function draw() {
    var query = $('#query').value.toLowerCase();
    var category = $('#category').value;
    var chain = $('#chain').value;

    var visible = rows
      .filter(function (row) { return rowMatches(row, query, category, chain); })
      .sort(compareRows);

    $('#count').textContent = visible.length + ' RESULTS';

    var body = visible.slice(0, 250).map(rowHtml).join('');
    $('#rows').innerHTML = body || '<tr><td colspan="6">No matching protocols.</td></tr>';

    $all('#rows tr[data-slug]').forEach(function (tr) {
      tr.onclick = function () {
        var row = rows.find(function (item) { return item.slug === tr.dataset.slug; });
        showDetail(row);
      };
    });
  }

  // ---- detail panel ----

  function metric(label, value) {
    return '<div class="metric"><small>' + label + '</small><strong>' + value + '</strong></div>';
  }

  function valuePathText(row) {
    var derivation = row.derivation || {};
    var text = escapeHtml(derivation.method || '') + '. ';
    if (derivation.comparable_mcap_tvl) {
      text +=
        'Comparable median ' + derivation.comparable_mcap_tvl.toFixed(2) + '× TVL; ' +
        'growth factor ' + derivation.growth_factor.toFixed(2) + '; ' +
        'age factor ' + derivation.age_factor.toFixed(2) + '; ' +
        'category factor ' + derivation.category_factor.toFixed(2) + '.';
    }
    return text;
  }

  function showDetail(row) {
    var panel = $('#detail');
    panel.dataset.slug = row.slug;

    var trades = row.token_status === 'token trades';
    var badgeClass = trades ? 'badge live' : 'badge';
    var badgeText = trades ? 'TOKEN TRADES' : 'RECORDS NO TOKEN';

    var steps = (row.farm_steps || [])
      .map(function (step) { return '<li>' + escapeHtml(step) + '</li>'; })
      .join('');

    panel.innerHTML =
      '<div class="detail-head">' +
        '<small>RANK ' + row.rank + ' · ' + escapeHtml(row.category || 'UNCATEGORIZED') + '</small>' +
        '<h2>' + escapeHtml(row.name) + '</h2>' +
        '<span class="' + badgeClass + '">' + badgeText + '</span>' +
      '</div>' +
      '<div class="metric-grid">' +
        metric('IMPLIED VALUE', formatDollars(row.implied_value_usd)) +
        metric('TVL', formatDollars(row.tvl_usd)) +
        metric('7 DAY TVL', formatPercent(row.change_7d)) +
        metric('CHAINS', escapeHtml((row.chains || []).join(', ') || 'Not reported')) +
        metric('MARKET CAP', row.mcap_usd ? formatDollars(row.mcap_usd) : 'Not recorded') +
        metric('LISTED', row.listed_at || 'Not reported') +
      '</div>' +
      '<section><small>VALUE PATH</small><p>' + valuePathText(row) + '</p></section>' +
      '<section><small>PRACTICAL STEPS</small><ol>' + steps + '</ol></section>';

    draw();
  }

  // ---- wiring ----

  $all('[data-sort]').forEach(function (button) {
    button.onclick = function () {
      var key = button.dataset.sort;
      if (sortKey === key) {
        sortDirection = -sortDirection;
      } else {
        sortKey = key;
        sortDirection = 1;
      }
      draw();
    };
  });

  $('#query').oninput = draw;
  $('#category').onchange = draw;
  $('#chain').onchange = draw;
  $('#reset').onclick = function () {
    $('#query').value = '';
    $('#category').value = '';
    $('#chain').value = '';
    draw();
  };

  // ---- init ----

  renderHeader();
  buildFilters();
  draw();
  if (rows.length) showDetail(rows[0]);
})();
