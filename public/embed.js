/*
 * VibeLog embed loader (G4).
 *
 * Drop this one line anywhere on your own site:
 *
 *   <script src="https://vibelog.natebuilds.dev/embed.js" async
 *           data-vibelog data-width="380" data-height="250"></script>
 *
 * It injects an <iframe> pointing at <this script's origin>/embed — the compact
 * live widget. The widget origin is derived from THIS script's own src, so the
 * same file works unmodified from localhost, *.workers.dev, or a custom domain.
 *
 * Optional data-* attributes on the <script> tag:
 *   data-width   iframe width  (px or any CSS length; default 380)
 *   data-height  iframe height (px or any CSS length; default 250)
 *   data-target  CSS selector of an element to mount into (default: inline,
 *                right where the script tag sits)
 *
 * No tracking, no cookies, no globals leaked. The iframe is sandboxed: it can
 * run its own scripts and open the "powered by" link, but cannot touch the host
 * page. The widget only ever fetches the already-public snapshot surface.
 */
(function () {
  "use strict";

  // Locate this very <script>. document.currentScript works for sync loads;
  // for async/defer we fall back to the last script that points at embed.js.
  var self =
    document.currentScript ||
    (function () {
      var all = document.getElementsByTagName("script");
      for (var i = all.length - 1; i >= 0; i--) {
        if (/\/embed\.js(\?|#|$)/.test(all[i].src || "")) return all[i];
      }
      return null;
    })();

  if (!self || !self.src) return; // can't resolve our origin — bail quietly

  // Origin = scheme + host of this script's URL (so /embed is a sibling of it).
  var origin;
  try {
    origin = new URL(self.src, document.baseURI).origin;
  } catch (e) {
    return;
  }

  var d = self.dataset || {};
  var width = d.width || "380";
  var height = d.height || "250";
  // Bare numbers become pixels; anything with a unit (%, vw, …) is passed through.
  var asLen = function (v) {
    return /^[0-9]+$/.test(String(v)) ? v + "px" : String(v);
  };

  var iframe = document.createElement("iframe");
  iframe.src = origin + "/embed";
  iframe.title = "VibeLog — live build status";
  iframe.loading = "lazy";
  iframe.setAttribute("scrolling", "no");
  // Run the widget's own scripts + let the badge open in a new tab; the iframe
  // gets its OWN (widget) origin, never the host's, so it can't read the parent.
  iframe.setAttribute(
    "sandbox",
    "allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"
  );
  iframe.setAttribute("referrerpolicy", "no-referrer");
  iframe.style.cssText =
    "width:" + asLen(width) +
    ";height:" + asLen(height) +
    ";max-width:100%;border:0;border-radius:16px;display:block;background:transparent;color-scheme:normal;";
  // Transparent background so it blends into the host page (older engines).
  iframe.setAttribute("allowtransparency", "true");

  var mount = d.target ? document.querySelector(d.target) : null;
  if (mount) {
    mount.appendChild(iframe);
  } else if (self.parentNode) {
    self.parentNode.insertBefore(iframe, self.nextSibling);
  } else {
    (document.body || document.documentElement).appendChild(iframe);
  }
})();
