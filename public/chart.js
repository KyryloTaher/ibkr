/* Responsive SVG line charts with fully labeled axes and per-point hover / focus. */
(function () {
  'use strict';
  const currency = new Intl.NumberFormat('en-IE', {
    style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2
  });
  const axisCurrency = new Intl.NumberFormat('en-IE', {
    style: 'currency', currency: 'EUR', maximumFractionDigits: 0
  });
  const esc = value => String(value).replace(/[&<>"']/g, c =>
    ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  function render(host, originalPoints, options = {}) {
    const points = originalPoints.filter(point =>
      /^\d{4}-\d{2}-\d{2}$/.test(point.date) && Number.isFinite(point.value)
    );
    if (!points.length) {
      host.innerHTML = '<div class="empty">No dated values available for this chart.</div>';
      return;
    }

    const width = 760, height = 300;
    const left = 108, right = 22, top = 20, bottom = 66;
    const plotW = width - left - right, plotH = height - top - bottom;
    const values = points.map(p => p.value);
    let min = Math.min(...values), max = Math.max(...values);
    if (options.includeZero) { min = Math.min(min, 0); max = Math.max(max, 0); }
    const padding = Math.max((max - min) * 0.10, Math.abs(max) * 0.025, 1);
    min -= padding;
    max += padding;
    const X = i => left + (points.length === 1 ? plotW / 2 : plotW * i / (points.length - 1));
    const Y = value => top + (max - value) * plotH / (max - min);
    const line = points.map((p, i) =>
      (i ? 'L' : 'M') + X(i).toFixed(2) + ',' + Y(p.value).toFixed(2)
    ).join(' ');
    const yLabel = options.yLabel || 'Value (EUR)';
    const heading = options.title || 'Investment history';
    const xIndices = [...new Set([0, Math.floor((points.length - 1) / 2), points.length - 1])];

    let svg = '<svg class="interactive-line-chart" viewBox="0 0 ' + width + ' ' + height +
      '" role="group" aria-label="' + esc(heading) + ', horizontal axis Date, vertical axis ' +
      esc(yLabel) + '">';
    for (let tick = 0; tick <= 4; tick++) {
      const amount = min + (max - min) * tick / 4;
      const y = Y(amount);
      svg += '<line class="chart-grid-line" x1="' + left + '" x2="' + (width - right) +
        '" y1="' + y + '" y2="' + y + '"/>';
      svg += '<text class="chart-tick" x="' + (left - 12) + '" y="' + (y + 4) +
        '" text-anchor="end">' + esc(axisCurrency.format(amount)) + '</text>';
    }
    svg += '<line class="chart-axis-line" x1="' + left + '" x2="' + left +
      '" y1="' + top + '" y2="' + (top + plotH) + '"/>';
    svg += '<line class="chart-axis-line" x1="' + left + '" x2="' + (left + plotW) +
      '" y1="' + (top + plotH) + '" y2="' + (top + plotH) + '"/>';
    for (const i of xIndices) {
      svg += '<line class="chart-axis-line" x1="' + X(i) + '" x2="' + X(i) +
        '" y1="' + (top + plotH) + '" y2="' + (top + plotH + 5) + '"/>';
      svg += '<text class="chart-tick" x="' + X(i) + '" y="' +
        (top + plotH + 20) + '" text-anchor="middle">' + esc(points[i].date) + '</text>';
    }
    svg += '<text class="chart-axis-title" x="' + (left + plotW / 2) +
      '" y="' + (height - 12) + '" text-anchor="middle">Date</text>';
    svg += '<text class="chart-axis-title" transform="translate(18 ' +
      (top + plotH / 2) + ') rotate(-90)" text-anchor="middle">' + esc(yLabel) + '</text>';
    svg += '<path d="' + line + '" fill="none" stroke="' +
      (options.lineColor || '#287e98') +
      '" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round" pointer-events="none"/>';

    for (let i = 0; i < points.length; i++) {
      svg += '<circle class="chart-data-point" cx="' + X(i) + '" cy="' + Y(points[i].value) +
        '" r="' + (points.length < 16 ? 3 : 2.4) + '" fill="' +
        (options.lineColor || '#287e98') + '" pointer-events="none"/>';
    }
    svg += '<line class="chart-focus-guide" x1="0" x2="0" y1="' + top + '" y2="' +
      (top + plotH) + '" visibility="hidden"/>';
    svg += '<circle class="chart-focus-dot" cx="0" cy="0" r="6.5" visibility="hidden" ' +
      'fill="' + (options.lineColor || '#287e98') + '"/>';
    for (let i = 0; i < points.length; i++) {
      const start = i === 0 ? left : (X(i - 1) + X(i)) / 2;
      const stop = i === points.length - 1 ? left + plotW : (X(i) + X(i + 1)) / 2;
      const label = points[i].date + ': ' + currency.format(points[i].value);
      svg += '<rect class="chart-point-hit" x="' + start + '" y="' + top +
        '" width="' + (stop - start) + '" height="' + plotH +
        '" fill="transparent" tabindex="0" focusable="true" role="button" ' +
        'aria-label="' + esc(label) + '" data-chart-index="' + i + '"/>';
    }
    svg += '</svg><div class="chart-tooltip" role="tooltip" hidden></div>';
    host.innerHTML = svg;

    const tooltip = host.querySelector('.chart-tooltip');
    const guide = host.querySelector('.chart-focus-guide');
    const dot = host.querySelector('.chart-focus-dot');
    const chart = host.querySelector('svg');
    function activate(index) {
      const p = points[index];
      const x = X(index), y = Y(p.value);
      guide.setAttribute('x1', x);
      guide.setAttribute('x2', x);
      guide.setAttribute('visibility', 'visible');
      dot.setAttribute('cx', x);
      dot.setAttribute('cy', y);
      dot.setAttribute('visibility', 'visible');
      tooltip.textContent = p.date + ': ' + currency.format(p.value);
      tooltip.hidden = false;
      // getBoundingClientRect accounts for SVG scaling and its responsive layout.
      const bounds = host.getBoundingClientRect(), pointBounds = dot.getBoundingClientRect();
      const targetX = pointBounds.left + pointBounds.width / 2 - bounds.left;
      const tooltipHalf = tooltip.offsetWidth / 2;
      tooltip.style.left = Math.min(
        Math.max(targetX, tooltipHalf + 7),
        Math.max(tooltipHalf + 7, bounds.width - tooltipHalf - 7)
      ) + 'px';
      const targetY = pointBounds.top - bounds.top;
      tooltip.style.top = Math.max(24, targetY - 9) + 'px';
      tooltip.classList.toggle('below-point', targetY < 64);
    }
    function hide() {
      tooltip.hidden = true;
      guide.setAttribute('visibility', 'hidden');
      dot.setAttribute('visibility', 'hidden');
    }
    host.querySelectorAll('.chart-point-hit').forEach(hit => {
      const i = Number(hit.dataset.chartIndex);
      hit.addEventListener('pointerenter', () => activate(i));
      hit.addEventListener('pointermove', () => activate(i));
      hit.addEventListener('focus', () => activate(i));
      hit.addEventListener('blur', hide);
      hit.addEventListener('pointerdown', () => activate(i));
    });
    chart.addEventListener('pointerleave', hide);
  }
  window.PortfolioChart = {render};
})();
