/**
 * Copies the host's menus and HUD onto the guest's screen: the host sends its
 * UI as HTML, and the guest patches its own copy to match, node by node, so
 * unchanged parts (and their CSS animations) are left alone.
 */
export function morph(dst: Element, html: string) {
  const tpl = document.createElement('template');
  tpl.innerHTML = html;
  patchChildren(dst, tpl.content);
}

function patchChildren(dst: Node, src: Node) {
  const s = src.childNodes;
  for (let i = 0; i < s.length; i++) {
    const sn = s[i];
    const dn = dst.childNodes[i];
    if (!dn) {
      dst.appendChild(document.importNode(sn, true));
    } else if (dn.nodeType !== sn.nodeType || dn.nodeName !== sn.nodeName) {
      dst.replaceChild(document.importNode(sn, true), dn);
    } else if (sn.nodeType === Node.ELEMENT_NODE) {
      patchAttrs(dn as Element, sn as Element);
      patchChildren(dn, sn);
    } else if (dn.nodeValue !== sn.nodeValue) {
      dn.nodeValue = sn.nodeValue;
    }
  }
  while (dst.childNodes.length > s.length) dst.removeChild(dst.lastChild!);
}

function patchAttrs(dst: Element, src: Element) {
  for (const a of [...dst.attributes]) if (!src.hasAttribute(a.name)) dst.removeAttribute(a.name);
  for (const a of [...src.attributes]) if (dst.getAttribute(a.name) !== a.value) dst.setAttribute(a.name, a.value);
}
