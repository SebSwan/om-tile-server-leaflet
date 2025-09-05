// startRepl.ts
import repl from 'node:repl';
export async function pry(ctx = {}) {
    await new Promise((resolve) => {
        const r = repl.start({ prompt: 'pry> ' });
        Object.assign(r.context, ctx);
        r.on('exit', () => resolve());
    });
}
