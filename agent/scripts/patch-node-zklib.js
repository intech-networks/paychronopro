import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

for (const [file,decoder] of [['zklibtcp.js','decodeTCPHeader'],['zklibudp.js','decodeUDPHeader']]) {
  const libraryPath = fileURLToPath(new URL(`../node_modules/node-zklib/${file}`, import.meta.url));
  const source = await readFile(libraryPath, 'utf8');
  const unsafe = new RegExp(`(}\\s*catch \\(err\\) \\{\\s*)reject\\(err\\)(\\s*}\\s*const header = ${decoder}\\(reply\\.subarray)`);
  if (unsafe.test(source)) await writeFile(libraryPath, source.replace(unsafe, '$1return reject(err)$2'));
  else if (!new RegExp(`return reject\\(err\\)[\\s\\S]{0,80}const header = ${decoder}`).test(source)) throw new Error(`Unsupported ${file} implementation; timeout patch was not applied.`);
}
