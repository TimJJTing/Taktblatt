import { compile } from '@inlang/paraglide-js';
import { paraglideOptions } from './paraglide-options.js';

await compile({ ...paraglideOptions, silent: true });
