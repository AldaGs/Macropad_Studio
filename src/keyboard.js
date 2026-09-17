// The keyboard picture, shared by the overlay window and the main window's grid view.
// Classic script, no modules: both windows just <script src> this before their own code.

function keyboardMarkup() {
    return `
        <div class="main-block block-main">
            <div class="key-row" style="margin-bottom: 15px;">
                <div class="key" data-id="27" style="margin-right: 20px;">ESC</div>

                <div class="key" data-id="112">F1</div>
                <div class="key" data-id="113">F2</div>
                <div class="key" data-id="114">F3</div>
                <div class="key" data-id="115" style="margin-right: 15px;">F4</div>

                <div class="key" data-id="116">F5</div>
                <div class="key" data-id="117">F6</div>
                <div class="key" data-id="118">F7</div>
                <div class="key" data-id="119" style="margin-right: 15px;">F8</div>

                <div class="key" data-id="120">F9</div>
                <div class="key" data-id="121">F10</div>
                <div class="key" data-id="122">F11</div>
                <div class="key" data-id="123">F12</div>
            </div>

            <div class="key-row">
                <div class="key" data-id="192">~</div><div class="key" data-id="49">1</div><div class="key" data-id="50">2</div><div class="key" data-id="51">3</div><div class="key" data-id="52">4</div><div class="key" data-id="53">5</div><div class="key" data-id="54">6</div><div class="key" data-id="55">7</div><div class="key" data-id="56">8</div><div class="key" data-id="57">9</div><div class="key" data-id="48">0</div><div class="key" data-id="189">-</div><div class="key" data-id="187">=</div><div class="key w-2" data-id="8">BACK</div>
            </div>
            <div class="key-row">
                <div class="key w-1-5" data-id="9">TAB</div><div class="key" data-id="81">Q</div><div class="key" data-id="87">W</div><div class="key" data-id="69">E</div><div class="key" data-id="82">R</div><div class="key" data-id="84">T</div><div class="key" data-id="89">Y</div><div class="key" data-id="85">U</div><div class="key" data-id="73">I</div><div class="key" data-id="79">O</div><div class="key" data-id="80">P</div><div class="key" data-id="219">[</div><div class="key" data-id="221">]</div><div class="key w-1-5" data-id="220">\\</div>
            </div>
            <div class="key-row">
                <div class="key w-2" data-id="20">CAPS</div><div class="key" data-id="65">A</div><div class="key" data-id="83">S</div><div class="key" data-id="68">D</div><div class="key" data-id="70">F</div><div class="key" data-id="71">G</div><div class="key" data-id="72">H</div><div class="key" data-id="74">J</div><div class="key" data-id="75">K</div><div class="key" data-id="76">L</div><div class="key" data-id="186">;</div><div class="key" data-id="222">'</div><div class="key w-2-25" data-id="13">ENTER</div>
            </div>
            <div class="key-row">
                <div class="key w-2-25" data-id="16">SHIFT</div><div class="key" data-id="90">Z</div><div class="key" data-id="88">X</div><div class="key" data-id="67">C</div><div class="key" data-id="86">V</div><div class="key" data-id="66">B</div><div class="key" data-id="78">N</div><div class="key" data-id="77">M</div><div class="key" data-id="188">,</div><div class="key" data-id="190">.</div><div class="key" data-id="191">/</div><div class="key w-2-75" data-id="16">SHIFT</div>
            </div>
            <div class="key-row">
                <div class="key w-1-5" data-id="17">CTRL</div><div class="key w-1-5" data-id="91">WIN</div><div class="key w-1-5" data-id="18">ALT</div><div class="key w-space" data-id="32">SPACE</div><div class="key w-1-5" data-id="18">ALT</div><div class="key w-1-5" data-id="17">CTRL</div>
            </div>
        </div>

        <div class="block-nav">
            <div class="nav-cluster">
                <div class="key-row"><div class="key" data-id="45">INS</div><div class="key" data-id="36">HOME</div><div class="key" data-id="33">PGUP</div></div>
                <div class="key-row"><div class="key" data-id="46">DEL</div><div class="key" data-id="35">END</div><div class="key" data-id="34">PGDN</div></div>
            </div>
            <div class="arrow-cluster">
                <div></div><div class="key" data-id="38">&#9650;</div><div></div>
                <div class="key" data-id="37">&#9664;</div><div class="key" data-id="40">&#9660;</div><div class="key" data-id="39">&#9654;</div>
            </div>
        </div>

        <div class="numpad-cluster block-numpad">
            <div class="key" data-id="144">NUM</div><div class="key" data-id="111">/</div><div class="key" data-id="106">*</div><div class="key" data-id="109">-</div>
            <div class="key" data-id="103">7</div><div class="key" data-id="104">8</div><div class="key" data-id="105">9</div><div class="key h-2" style="grid-row: span 2;" data-id="107">+</div>
            <div class="key" data-id="100">4</div><div class="key" data-id="101">5</div><div class="key" data-id="102">6</div>
            <div class="key" data-id="97">1</div><div class="key" data-id="98">2</div><div class="key" data-id="99">3</div><div class="key h-2" style="grid-row: span 2;" data-id="13">ENT</div>
            <div class="key w-2" style="grid-column: span 2;" data-id="96">0</div><div class="key" data-id="110">.</div>
        </div>`;
}

// Which macro actually fires on each key of `device`. Same precedence the engine
// uses: a macro bound to this macropad beats one left on "any device", so the
// picture shows what would really happen.
function macrosByKey(macros, device) {
    const hwid = device ? device.hwid : null;
    const shown = new Map();
    for (const m of macros) {
        if (m.device && m.device !== hwid) continue;
        const existing = shown.get(String(m.keyId));
        if (existing && existing.device && !m.device) continue;
        shown.set(String(m.keyId), m);
    }
    return shown;
}

// Light up `container` for one device. Returns the keyId -> macro map it drew,
// so callers can answer "what is on the key that was just clicked?".
function paintKeyboard(container, macros, device, freeLabel = 'Free') {
    // Only the blocks this macropad physically has
    container.className = 'keyboard-container layout-' + ((device && device.layout) || 'full');

    // Reset every key
    container.querySelectorAll('.key').forEach(key => {
        key.classList.remove('active', 'type-send', 'type-run', 'type-js', 'type-clock');
        key.dataset.tip = freeLabel;
    });

    const shown = macrosByKey(macros, device);

    // querySelectorAll, not querySelector: data-id 13 is both main Enter and numpad
    // ENT, and 16/17/18 are the left and right modifier pairs. Only lighting the
    // first match left the numpad key dark whenever it was mapped.
    for (const [keyId, macro] of shown) {
        // 'custom' is the pre-engine-swap AHK type; it edits as JavaScript, so colour it as one
        const type = macro.type === 'custom' ? 'js' : macro.type;
        container.querySelectorAll(`.key[data-id="${keyId}"]`).forEach(key => {
            key.classList.add('active', 'type-' + type);
            key.dataset.tip = macro.desc ? macro.desc : macro.visualValue;
        });
    }
    return shown;
}

// The single tooltip node, parked on <html> so nothing in the page can clip it.
// (<body> is no good in the overlay: its popIn animation leaves a transform behind,
// which would make it a containing block and offset every coordinate by its padding.)
let tooltipEl = null;
function tooltipNode() {
    if (!tooltipEl) {
        tooltipEl = document.createElement('div');
        tooltipEl.id = 'kb-tooltip';
        document.documentElement.appendChild(tooltipEl);
    }
    return tooltipEl;
}

// Show the tooltip against its key, kept inside the viewport: above the key when
// there is room, below it otherwise, and never past either edge.
function showTooltip(key) {
    const label = key.dataset.tip;
    if (!label) return hideTooltip();

    const tip = tooltipNode();
    tip.innerText = label;
    // A mapped key tints its tooltip to match; .key.active sets colour to its type hue.
    tip.style.borderColor = key.classList.contains('active')
        ? getComputedStyle(key).color : '';

    // Measure at the origin first, then clamp - the node is laid out even while hidden.
    tip.style.left = '0px';
    tip.style.top = '0px';
    const k = key.getBoundingClientRect();
    const t = tip.getBoundingClientRect();

    const gap = 8;
    const above = k.top - t.height - gap;
    tip.style.left = Math.min(Math.max(gap, k.left + (k.width - t.width) / 2),
                              window.innerWidth - t.width - gap) + 'px';
    tip.style.top = (above < gap ? k.bottom + gap : above) + 'px';
    tip.classList.add('show');
}

function hideTooltip() {
    if (tooltipEl) tooltipEl.classList.remove('show');
}

// Two delegated listeners cover every keyboard on the page, across any repaint.
document.addEventListener('mouseover', (e) => {
    const key = e.target.closest && e.target.closest('.key');
    if (key) showTooltip(key); else hideTooltip();
});
document.addEventListener('mouseleave', hideTooltip, true);

// Tabs only earn their space once there is more than one macropad.
function renderDeviceTabs(host, devices, selected) {
    // Names are user-typed and land in markup, so escape them.
    const esc = (s) => String(s).replace(/[&<>"']/g, (c) =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

    host.innerHTML = devices.length > 1
        ? devices.map((d, i) =>
            `<div class="device-tab${i === selected ? ' selected' : ''}" data-index="${i}">${esc(d.name)}</div>`).join('')
        : '';
}
