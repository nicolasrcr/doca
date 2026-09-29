import { readRows, prepare } from './src/lib/parse';
import * as fs from 'fs';
import * as path from 'path';

async function verifyFieldDetection() {
  const files = [
    '/tmp/claude-0/-home-claude/94467d48-9073-5d51-9076-7981e4c9f2c1/scratchpad/868b539d-f_sammmm.xlsx',
    '/tmp/claude-0/-home-claude/94467d48-9073-5d51-9076-7981e4c9f2c1/scratchpad/6a283338-Monitoramento_de_bipagem_de_entregaLista21009820260925231524.xlsx'
  ];

  const keys = ['cod', 'ent', 'prob', 'hr_saida', 'hr_chegada', 'tempo_retencao', 'base', 'tipo_produto', 'peso', 'assinante'];

  for (const file of files) {
    if (!fs.existsSync(file)) {
      console.log(`\n📁 File not found: ${path.basename(file)}`);
      continue;
    }
    
    console.log(`\n📊 Testing: ${path.basename(file)}`);
    try {
      const fileBlob = new File([fs.readFileSync(file)], path.basename(file));
      const rows = await readRows(fileBlob);
      console.log(`  ✓ Read ${rows.length} rows`);
      
      const result = prepare(rows, keys, {});
      console.log(`  📋 Field Detection Results:`);
      const detected: string[] = [];
      const missing: string[] = [];
      
      for (const k of keys) {
        const idx = result.map[k];
        if (idx >= 0) {
          detected.push(k);
          console.log(`    ✓ ${k.padEnd(15)} → Column ${idx}`);
        } else {
          missing.push(k);
          console.log(`    ✗ ${k.padEnd(15)} → Not detected`);
        }
      }
      
      console.log(`  📈 Summary: ${detected.length}/${keys.length} fields detected`);
      if (missing.length > 0) {
        console.log(`  ⚠️  Missing: ${missing.join(', ')}`);
      }
    } catch (e) {
      console.error(`  ✗ Error: ${(e as Error).message}`);
    }
  }
}

verifyFieldDetection().catch(console.error);
