import { createRequire } from 'module'; const require = createRequire(import.meta.url); const a = require('firebase-admin'); console.log(Object.keys(a));  
