(() => {
  const page = document.body.dataset.page || "albums";
  const grid = document.getElementById("grid");
  const pager = document.getElementById("pager");
  const meta = document.getElementById("meta");
  const form = document.getElementById("q");
  const lb = document.getElementById("lb");
  const lbbody = document.getElementById("lbbody");
  const lbx = document.getElementById("lbx");
  const navAlbum = document.getElementById("nav-album");
  const pwdDlg = document.getElementById("pwd");
  const pwdIn = document.getElementById("pwdin");
  const pwdErr = document.getElementById("pwderr");
  const pwdName = document.getElementById("pwdname");
  const pwdOk = document.getElementById("pwdok");

  const MAGIC = new TextEncoder().encode("PHENC1");
  const VERIFIER = "photos-ok";
  const keyCache = new Map();
  const blobCache = new Map();

  let albums = [];
  let photos = [];
  let currentAlbum = null;
  let albumName = "";
  let keyword = "";
  let curPage = 1;
  let size = page === "albums" ? 12 : 24;
  let lbItem = null;
  let pendingAlbum = null;

  const LOCK_SVG =
    '<svg class="lock-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>';

  function esc(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function absUrl(src) {
    if (!src) return "";
    try { return new URL(src, location.href).href; } catch (e) { return src; }
  }

  function unlockFlag(name) {
    return "photos_unlock:" + name;
  }

  function keyStore(name) {
    return "photos_key:" + name;
  }

  function isUnlocked(name) {
    try { return sessionStorage.getItem(unlockFlag(name)) === "1"; } catch (e) { return false; }
  }

  function setUnlocked(name, rawKeyB64) {
    try {
      sessionStorage.setItem(unlockFlag(name), "1");
      if (rawKeyB64) sessionStorage.setItem(keyStore(name), rawKeyB64);
    } catch (e) {}
  }

  function isLockedAlbum(a) {
    return !!(a && (a.encrypted || a.crypto));
  }

  function srcOf(thumb) {
    const t = String(thumb || "");
    if (!t) return "";
    if (/^https?:\/\//i.test(t)) return t;
    return t.replace(/^\/photos\//, "");
  }

  function b64ToBytes(b64) {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  function bytesToB64(buf) {
    const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    let s = "";
    for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]);
    return btoa(s);
  }

  function mimeOf(u8) {
    if (u8.length >= 3 && u8[0] === 0xff && u8[1] === 0xd8 && u8[2] === 0xff) return "image/jpeg";
    if (u8.length >= 8 && u8[0] === 0x89 && u8[1] === 0x50) return "image/png";
    if (u8.length >= 6 && u8[0] === 0x47 && u8[1] === 0x49 && u8[2] === 0x46) return "image/gif";
    if (u8.length >= 12 && u8[8] === 0x57 && u8[9] === 0x45 && u8[10] === 0x42 && u8[11] === 0x50) return "image/webp";
    return "application/octet-stream";
  }

  async function deriveKey(password, saltB64, iterations) {
    const salt = b64ToBytes(saltB64);
    const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
    const bits = await crypto.subtle.deriveBits(
      { name: "PBKDF2", salt, iterations: iterations || 210000, hash: "SHA-256" },
      base,
      256
    );
    const raw = new Uint8Array(bits);
    const key = await crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["decrypt"]);
    return { key, raw };
  }

  async function decryptBytes(key, buf) {
    const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    if (u8.length < 34) throw new Error("bad enc");
    for (let i = 0; i < 6; i++) if (u8[i] !== MAGIC[i]) throw new Error("bad magic");
    const iv = u8.slice(6, 18);
    const tag = u8.slice(18, 34);
    const data = u8.slice(34);
    const ct = new Uint8Array(data.length + tag.length);
    ct.set(data, 0);
    ct.set(tag, data.length);
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct);
    return new Uint8Array(plain);
  }

  async function verifyPassword(album, password) {
    const c = album && album.crypto;
    if (!c || !c.salt || !c.verifier) throw new Error("no crypto");
    const { key, raw } = await deriveKey(password, c.salt, c.iterations);
    const plain = await decryptBytes(key, b64ToBytes(c.verifier));
    if (new TextDecoder().decode(plain) !== VERIFIER) throw new Error("bad pwd");
    return { key, raw };
  }

  async function getAlbumKey(album) {
    const name = album.name;
    if (keyCache.has(name)) return keyCache.get(name);
    try {
      const b64 = sessionStorage.getItem(keyStore(name));
      if (b64) {
        const raw = b64ToBytes(b64);
        const key = await crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["decrypt"]);
        keyCache.set(name, key);
        return key;
      }
    } catch (e) {}
    return null;
  }

  async function decryptToObjectUrl(album, encPath) {
    const path = srcOf(encPath);
    const cacheKey = album.name + "|" + path;
    if (blobCache.has(cacheKey)) return blobCache.get(cacheKey);
    const key = await getAlbumKey(album);
    if (!key) throw new Error("locked");
    const res = await fetch(path);
    if (!res.ok) throw new Error("fetch");
    const buf = await res.arrayBuffer();
    const plain = await decryptBytes(key, buf);
    const url = URL.createObjectURL(new Blob([plain], { type: mimeOf(plain) }));
    blobCache.set(cacheKey, url);
    return url;
  }

  async function copyText(s) {
    try {
      await navigator.clipboard.writeText(s);
      return true;
    } catch (e) {
      const ta = document.createElement("textarea");
      ta.value = s;
      ta.style.cssText = "position:fixed;left:-9999px";
      document.body.appendChild(ta);
      ta.select();
      let ok = false;
      try { ok = document.execCommand("copy"); } catch (err) {}
      ta.remove();
      return ok;
    }
  }

  function flashBtn(el) {
    const t = el.textContent;
    el.textContent = "已复制";
    setTimeout(() => { el.textContent = t; }, 1000);
  }

  function bindCopy(id, getText) {
    const el = document.getElementById(id);
    if (!el) return;
    el.onclick = async (e) => {
      e.stopPropagation();
      const s = getText();
      if (!s) return;
      if (await copyText(s)) flashBtn(el);
    };
  }

  function openLb(src, name, encrypted) {
    if (!src || !lb) return;
    lbItem = { url: src, name: name || "", encrypted: !!encrypted };
    lbbody.innerHTML = `<img src="${esc(src)}" alt="${esc(name || "")}">`;
    const info = document.getElementById("lbinfo");
    if (info) info.textContent = encrypted ? "加密图片（仅本地解密预览）" : absUrl(src);
    const lburl = document.getElementById("lburl");
    const lbmd = document.getElementById("lbmd");
    const lbhtml = document.getElementById("lbhtml");
    if (lburl) lburl.hidden = !!encrypted;
    if (lbmd) lbmd.hidden = !!encrypted;
    if (lbhtml) lbhtml.hidden = !!encrypted;
    lb.hidden = false;
  }

  function closeLb() {
    if (!lb) return;
    lb.hidden = true;
    lbbody.innerHTML = "";
    lbItem = null;
  }

  function fillPager(el, pageNum, pages, total, pageSize, go, onSize) {
    if (!el) return;
    el.innerHTML = "";
    total = Math.max(0, Number(total) || 0);
    if (!total) return;
    const ps = Math.max(1, Number(pageSize) || 1);
    pages = Math.max(1, Math.ceil(total / ps));
    pageNum = Math.min(Math.max(1, Number(pageNum) || 1), pages);
    const info = document.createElement("span");
    info.textContent = "共 " + total + " 条";
    el.appendChild(info);
    if (typeof onSize === "function") {
      const lab = document.createElement("label");
      lab.append("每页");
      const sel = document.createElement("select");
      const opts = page === "albums" ? [6, 12, 24, 48] : [12, 24, 28, 48, 96];
      if (!opts.includes(ps)) opts.unshift(ps);
      opts.forEach((n) => {
        const o = document.createElement("option");
        o.value = String(n);
        o.textContent = String(n);
        if (n === ps) o.selected = true;
        sel.appendChild(o);
      });
      sel.onchange = () => onSize(Number(sel.value));
      lab.appendChild(sel);
      el.appendChild(lab);
    }
    const prev = document.createElement("button");
    prev.type = "button";
    prev.setAttribute("aria-label", "上页");
    prev.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>';
    prev.disabled = pageNum <= 1;
    prev.onclick = () => go(pageNum - 1);
    el.appendChild(prev);
    const nums = [];
    const add = (n) => {
      if (!nums.includes(n) && n >= 1 && n <= pages) nums.push(n);
    };
    add(1);
    for (let i = pageNum - 2; i <= pageNum + 2; i++) add(i);
    add(pages);
    nums.sort((a, b) => a - b);
    let last = 0;
    nums.forEach((i) => {
      if (last && i - last > 1) {
        const s = document.createElement("span");
        s.textContent = "…";
        el.appendChild(s);
      }
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = String(i);
      if (i === pageNum) b.className = "on";
      b.onclick = () => {
        if (i !== pageNum) go(i);
      };
      el.appendChild(b);
      last = i;
    });
    const next = document.createElement("button");
    next.type = "button";
    next.setAttribute("aria-label", "下页");
    next.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>';
    next.disabled = pageNum >= pages;
    next.onclick = () => go(pageNum + 1);
    el.appendChild(next);
  }

  function bindPager(total) {
    const pages = total ? Math.max(1, Math.ceil(total / size)) : 1;
    if (curPage > pages) curPage = pages;
    if (curPage < 1) curPage = 1;
    fillPager(pager, curPage, pages, total, size, (i) => {
      curPage = i;
      render();
      window.scrollTo({ top: 0, behavior: "smooth" });
    }, (n) => {
      size = n;
      curPage = 1;
      render();
    });
    return { start: (curPage - 1) * size, pages };
  }

  function goAlbum(name) {
    location.href = "album?name=" + encodeURIComponent(name);
  }

  function askPwd(album, onOk) {
    pendingAlbum = { album, onOk };
    if (pwdName) pwdName.textContent = album.name || "";
    if (pwdErr) pwdErr.hidden = true;
    if (pwdIn) pwdIn.value = "";
    if (!pwdDlg) return;
    if (typeof pwdDlg.showModal === "function") pwdDlg.showModal();
    setTimeout(() => pwdIn && pwdIn.focus(), 0);
  }

  if (pwdDlg) {
    pwdDlg.addEventListener("close", () => {
      if (pwdDlg.returnValue !== "ok") pendingAlbum = null;
    });
  }

  if (pwdOk) {
    pwdOk.addEventListener("click", async (e) => {
      e.preventDefault();
      if (!pendingAlbum) return;
      const { album, onOk } = pendingAlbum;
      const input = (pwdIn && pwdIn.value) || "";
      pwdOk.disabled = true;
      try {
        if (!album.crypto) throw new Error("no crypto");
        const { key, raw } = await verifyPassword(album, input);
        keyCache.set(album.name, key);
        setUnlocked(album.name, bytesToB64(raw));
        pendingAlbum = null;
        pwdDlg.close("ok");
        onOk(album);
      } catch (err) {
        if (pwdErr) pwdErr.hidden = false;
        if (pwdIn) pwdIn.select();
      } finally {
        pwdOk.disabled = false;
      }
    });
  }

  if (pwdIn) {
    pwdIn.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        pwdOk && pwdOk.click();
      }
    });
  }

  function albumCard(a) {
    const locked = isLockedAlbum(a) && !isUnlocked(a.name);
    const n = (a.photos || []).length;
    const cover = srcOf((a.photos && a.photos[0] && a.photos[0].thumbnail) || "");
    let media;
    if (locked) {
      media = `<div class="ph lock">${LOCK_SVG}</div>`;
    } else if (isLockedAlbum(a)) {
      media = `<div class="ph" data-enc-cover="1">相册</div>`;
    } else if (cover) {
      media = `<img src="${esc(cover)}" alt="" loading="lazy" onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'ph',textContent:'相册'}))">`;
    } else {
      media = `<div class="ph">相册</div>`;
    }
    const badge = locked ? "加密" : n + " 张";
    return `<article class="card${locked ? " locked" : ""}" data-name="${esc(a.name)}" data-locked="${locked ? 1 : 0}">
      <div class="media"><span class="badge">${esc(badge)}</span>${media}<div class="t"><b>${esc(a.name)}</b></div></div>
    </article>`;
  }

  function photoCard(it, encrypted) {
    if (encrypted) {
      return `<article class="card" data-enc="${esc(srcOf(it.thumbnail))}" data-name="${esc(it.name || "")}">
        <div class="media"><span class="badge">加密</span><div class="ph">解密中</div><div class="t"><b>${esc(it.name || "")}</b></div></div>
      </article>`;
    }
    const src = srcOf(it.thumbnail);
    const media = src
      ? `<img src="${esc(src)}" alt="" loading="lazy" onload="if(this.naturalWidth>this.naturalHeight)this.closest('.card').classList.add('land')" onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'ph',textContent:'图片'}))">`
      : `<div class="ph">图片</div>`;
    return `<article class="card" data-src="${esc(src)}" data-name="${esc(it.name || "")}">
      <div class="media"><span class="badge">图片</span>${media}<div class="t"><b>${esc(it.name || "")}</b></div></div>
    </article>`;
  }

  async function hydrateAlbumCovers(rows) {
    for (const a of rows) {
      if (!isLockedAlbum(a) || !isUnlocked(a.name)) continue;
      const el = grid.querySelector(`.card[data-name="${CSS.escape(a.name)}"] [data-enc-cover]`);
      if (!el || !a.photos || !a.photos[0]) continue;
      try {
        const url = await decryptToObjectUrl(a, a.photos[0].thumbnail);
        const img = document.createElement("img");
        img.src = url;
        img.alt = "";
        el.replaceWith(img);
      } catch (e) {}
    }
  }

  async function hydratePhotoCards(album) {
    const cards = [...grid.querySelectorAll(".card[data-enc]")];
    for (const el of cards) {
      try {
        const url = await decryptToObjectUrl(album, el.dataset.enc);
        el.dataset.src = url;
        const ph = el.querySelector(".ph");
        const img = document.createElement("img");
        img.src = url;
        img.alt = "";
        img.loading = "lazy";
        img.onload = () => {
          if (img.naturalWidth > img.naturalHeight) el.classList.add("land");
        };
        if (ph) ph.replaceWith(img);
        const badge = el.querySelector(".badge");
        if (badge) badge.textContent = "图片";
      } catch (e) {
        const ph = el.querySelector(".ph");
        if (ph) ph.textContent = "解密失败";
      }
    }
  }

  function renderAlbums() {
    let rows = albums;
    if (keyword) {
      const k = keyword.toLowerCase();
      rows = rows.filter((a) => (a.name || "").toLowerCase().includes(k));
    }
    const total = rows.length;
    const { start } = bindPager(total);
    const slice = rows.slice(start, start + size);
    if (!slice.length) {
      grid.innerHTML = `<p class="empty">暂无相册</p>`;
    } else {
      grid.innerHTML = slice.map(albumCard).join("");
      grid.querySelectorAll(".card").forEach((el) => {
        el.addEventListener("click", () => {
          const name = el.dataset.name;
          const album = albums.find((a) => a.name === name);
          if (!album) return;
          if (isLockedAlbum(album) && !isUnlocked(album.name)) {
            askPwd(album, async () => {
              await renderAlbums();
              goAlbum(album.name);
            });
            return;
          }
          if (isLockedAlbum(album) && !album.crypto) {
            grid.innerHTML = `<p class="empty">相册未加密，请先运行 encrypt-album.js</p>`;
            return;
          }
          goAlbum(album.name);
        });
      });
      hydrateAlbumCovers(slice);
    }
    if (meta) {
      meta.hidden = false;
      meta.textContent = "共 " + total + " 个相册";
    }
  }

  async function renderPhotos() {
    let rows = photos;
    if (keyword) {
      const k = keyword.toLowerCase();
      rows = rows.filter((it) => (it.name || "").toLowerCase().includes(k));
    }
    const total = rows.length;
    const { start } = bindPager(total);
    const slice = rows.slice(start, start + size);
    const encrypted = !!(currentAlbum && isLockedAlbum(currentAlbum));
    if (!slice.length) {
      grid.innerHTML = `<p class="empty">${encrypted && currentAlbum && !currentAlbum.crypto ? "相册未加密，请先运行 encrypt-album.js" : "暂无图片"}</p>`;
    } else {
      grid.innerHTML = slice.map((it) => photoCard(it, encrypted)).join("");
      grid.querySelectorAll(".card").forEach((el) => {
        el.addEventListener("click", () => openLb(el.dataset.src, el.dataset.name || "", encrypted));
      });
      if (encrypted && currentAlbum) await hydratePhotoCards(currentAlbum);
    }
    if (meta) {
      meta.hidden = false;
      meta.textContent = albumName + " · " + total + " 张";
    }
    if (navAlbum) {
      navAlbum.textContent = albumName || "相册";
      navAlbum.href = "album?name=" + encodeURIComponent(albumName);
    }
    document.title = (albumName || "相册") + " | 狂欢马克思";
  }

  function render() {
    if (page === "album") return renderPhotos();
    return renderAlbums();
  }

  if (form) {
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      keyword = (new FormData(form).get("name") || "").trim();
      curPage = 1;
      render();
    });
  }

  const themeBtn = document.getElementById("theme");
  if (themeBtn) {
    themeBtn.onclick = () => {
      const cur = document.documentElement.dataset.theme === "light" ? "dark" : "light";
      document.documentElement.dataset.theme = cur;
      try { localStorage.setItem("theme", cur); } catch (e) {}
    };
  }

  if (lb && lbx) {
    bindCopy("lburl", () => (lbItem && !lbItem.encrypted && lbItem.url) || "");
    bindCopy("lbmd", () => {
      if (!lbItem || lbItem.encrypted) return "";
      return `![${lbItem.name || ""}](${lbItem.url})`;
    });
    bindCopy("lbhtml", () => {
      if (!lbItem || lbItem.encrypted) return "";
      return `<img src="${lbItem.url}" alt="${lbItem.name || ""}">`;
    });
    lbx.onclick = (e) => { e.stopPropagation(); closeLb(); };
    lb.onclick = (e) => {
      if (e.target === lb) closeLb();
    };
    document.getElementById("lbbar")?.addEventListener("click", (e) => e.stopPropagation());
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !lb.hidden) closeLb();
    });
  }

  fetch("photos.json")
    .then((r) => r.json())
    .then(async (data) => {
      albums = (data || []).slice().sort((a, b) => (a.sort || 0) - (b.sort || 0));
      if (page === "album") {
        albumName = new URLSearchParams(location.search).get("name") || "";
        const found = albums.find((a) => a.name === albumName);
        if (!found) {
          grid.innerHTML = `<p class="empty">相册不存在</p>`;
          return;
        }
        currentAlbum = found;
        if (isLockedAlbum(found)) {
          if (!found.crypto) {
            if (navAlbum) navAlbum.textContent = found.name;
            grid.innerHTML = `<p class="empty">相册未加密，请先运行 encrypt-album.js</p>`;
            return;
          }
          if (!isUnlocked(found.name) || !(await getAlbumKey(found))) {
            if (navAlbum) navAlbum.textContent = found.name;
            grid.innerHTML = `<p class="empty">请先解锁相册</p>`;
            askPwd(found, async (album) => {
              currentAlbum = album;
              photos = (album.photos || []).slice().sort((a, b) => (a.sort || 0) - (b.sort || 0));
              await renderPhotos();
            });
            return;
          }
        }
        photos = (found.photos || []).slice().sort((a, b) => (a.sort || 0) - (b.sort || 0));
      }
      await render();
    })
    .catch(() => {
      grid.innerHTML = `<p class="empty">加载失败</p>`;
    });
})();
