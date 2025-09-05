// Enable tsx programmatically if TSX_LOADER is set
import { register } from 'tsx/cjs/api';
if (process.env.TSX_LOADER === '1') {
    register({ transpileOnly: true });
}
