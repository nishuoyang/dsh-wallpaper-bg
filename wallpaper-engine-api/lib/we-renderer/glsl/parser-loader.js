// GLSL 解析器加载器 — 让第三方 workshop shader 效果成为「可选增强」
// ================================================================
// 上游实现直接 `import { parse } from '@shaderfrog/glsl-parser'`，该包是纯 ESM
// 且没有 CJS 入口，一旦缺失整个渲染器都无法加载（node:vm 里也没有 require）。
// 这里改成惰性动态 import：
//   - 缺包 → 渲染器照常工作，仅跳过「未内置实现的第三方 GLSL 效果」；
//   - 有包 → preloadGlsl() 预载后行为与上游完全一致。
// 解析结果缓存在模块状态里，compileGlsl 保持同步签名（不改变上游调用链）。

let _parse = null;
let _preprocess = null;
let _loading = null;
let _loaded = false;

/** 解析器是否已就绪（就绪后 _applyGlslEffect 才会真正执行） */
export function glslParserReady() {
  return _loaded;
}

/** 同步取 parser 的 parse()；未预载时返回 null（调用方回退原图） */
export function getGlslParse() {
  return _parse;
}

/** 同步取 preprocessor 的 preprocess()；未预载时返回 null */
export function getGlslPreprocess() {
  return _preprocess;
}

/**
 * 预载 GLSL 解析器（幂等，可并发调用）。
 * 返回 { ok, error }：ok=false 表示未安装依赖，渲染器降级但不崩。
 */
export function preloadGlsl() {
  if (_loaded) return Promise.resolve({ ok: true });
  if (_loading) return _loading;
  _loading = (async () => {
    try {
      const [parserMod, preMod] = await Promise.all([
        import('@shaderfrog/glsl-parser'),
        import('@shaderfrog/glsl-parser/preprocessor/index.js'),
      ]);
      _parse = parserMod.parse;
      _preprocess = preMod.default;
      if (typeof _parse !== 'function' || typeof _preprocess !== 'function') {
        throw new Error('GLSL 解析器导出异常');
      }
      _loaded = true;
      return { ok: true };
    } catch (err) {
      _loading = null;
      return { ok: false, error: String((err && err.message) || err) };
    }
  })();
  return _loading;
}
