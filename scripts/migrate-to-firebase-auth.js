/**
 * Script de migração única — Portão da Cerveja v78.0
 * Cria contas no Firebase Auth para todos os usuários do Firestore.
 *
 * Uso:
 *   node scripts/migrate-to-firebase-auth.js --dry-run   (lista sem alterar)
 *   node scripts/migrate-to-firebase-auth.js              (executa de verdade)
 *
 * Requer:
 *   GOOGLE_APPLICATION_CREDENTIALS=/caminho/para/serviceAccount.json
 */

const admin = require('firebase-admin');

const isDryRun = process.argv.includes('--dry-run');

admin.initializeApp({
  credential: admin.credential.applicationDefault(),
  projectId: 'gen-lang-client-0756600199',
});

const db = admin.firestore();
const authAdmin = admin.auth();

async function migrate() {
  console.log('\n🚀 Migração Firebase Auth — Portão da Cerveja v78.0');
  console.log(`Modo: ${isDryRun ? '🔍 DRY RUN (sem alterações)' : '⚡ EXECUÇÃO REAL'}\n`);

  const snapshot = await db.collection('users').get();
  const users = snapshot.docs.map(d => ({ docId: d.id, ...d.data() }));

  console.log(`📋 ${users.length} usuário(s) encontrado(s) no Firestore\n`);

  let success = 0, skipped = 0, errors = 0;

  for (const user of users) {
    const label = `[${user.email || user.docId}]`;

    if (!user.email) {
      console.log(`⚠️  ${label} Sem email — pulando`);
      skipped++;
      continue;
    }

    if (user.firebaseUid) {
      console.log(`✅ ${label} Já migrado (UID: ${user.firebaseUid})`);
      skipped++;
      continue;
    }

    if (isDryRun) {
      console.log(`🔍 ${label} Seria migrado → senha temporária gerada`);
      success++;
      continue;
    }

    try {
      let firebaseUser;

      try {
        // Senha temporária: id curto + sufixo seguro
        const tempPassword = `${user.docId.substring(0, 8)}@Pdc78!`;
        firebaseUser = await authAdmin.createUser({
          email: user.email,
          password: tempPassword,
          displayName: user.name || '',
          disabled: !user.active,
        });
        console.log(`✅ ${label} Criado no Auth → UID: ${firebaseUser.uid}`);
      } catch (createErr) {
        if (createErr.code === 'auth/email-already-exists') {
          firebaseUser = await authAdmin.getUserByEmail(user.email);
          console.log(`♻️  ${label} Já existia no Auth → vinculando UID: ${firebaseUser.uid}`);
        } else {
          throw createErr;
        }
      }

      // Salvar firebaseUid no documento Firestore
      await db.collection('users').doc(user.docId).update({
        firebaseUid: firebaseUser.uid,
      });

      success++;

    } catch (err) {
      console.error(`❌ ${label} Erro: ${err.message}`);
      errors++;
    }
  }

  console.log('\n─────────────────────────────────────');
  console.log(`✅ Migrados com sucesso: ${success}`);
  console.log(`⏭️  Pulados (já ok):     ${skipped}`);
  console.log(`❌ Erros:               ${errors}`);
  console.log('─────────────────────────────────────');

  if (!isDryRun && errors === 0) {
    console.log('\n⚠️  IMPORTANTE após confirmar tudo funcionando:');
    console.log('   Remova este script do repo:');
    console.log('   git rm scripts/migrate-to-firebase-auth.js');
    console.log('   Adicione ao .gitignore:');
    console.log('   echo "serviceAccount*.json" >> .gitignore');
  }

  if (errors > 0) {
    console.log('\n❌ Alguns usuários não foram migrados. Corrija os erros e rode novamente.');
  }

  process.exit(errors > 0 ? 1 : 0);
}

migrate().catch(err => {
  console.error('\n💥 Falha fatal:', err.message);
  process.exit(1);
});
