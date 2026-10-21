# Boot, check the engine pieces, open the menus and start a level in real time.
def run(wk):
    wk.wait_for('window.__FF && window.__FF.app', 120)
    info = wk.js("""(() => {
      const r = window.__FF.game.renderer.renderer;
      const gl = r.getContext();
      const dbg = gl.getExtension('WEBGL_debug_renderer_info');
      const m = window.__FF.models;
      return {
        webgl2: r.capabilities.isWebGL2,
        gpu: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
        models: m.names().length,
        placeholders: m.names().filter((n) => m.isPlaceholder && m.isPlaceholder(n)).length,
        screen: window.__FF.app.screen,
        storage: (() => { try { localStorage.setItem('wk', '1'); return localStorage.getItem('wk'); } catch (e) { return 'blocked: ' + e; } })(),
      };
    })()""")
    print('boot', info)
    wk.sleep(1.5)
    wk.shot('wk_title')
    wk.press('Enter')
    wk.sleep(0.8)
    wk.shot('wk_menu')
    wk.click('#m-play')
    wk.sleep(0.8)
    wk.shot('wk_levels')
    wk.click('[data-level="moveout"]')
    wk.sleep(3)
    t0 = wk.js('window.__FF.game.session.time')
    wk.sleep(3)
    t1 = wk.js('window.__FF.game.session.time')
    print('real-time: session clock advanced %.2fs in 3s of wall time' % (t1 - t0))
    wk.shot('wk_moveout')
    # walk player 1 forward for a second
    wk.key('KeyW', True)
    wk.sleep(1.2)
    wk.key('KeyW', False)
    p = wk.js('(() => { const p = window.__FF.game.session.players[0].bodyPos; return [p.x, p.y, p.z]; })()')
    print('p1 after walking', p)
    wk.shot('wk_walk')
