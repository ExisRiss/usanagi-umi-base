/* Tes base — jalankan dengan `npm test`. */
import test from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const AKAR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const { opsiSocket, OPSI_DASAR, ringkasOpsi } = await import(path.join(AKAR, 'lib/socket-options.js'))
const { bacaKonfig, KONFIG_BAWAAN } = await import(path.join(AKAR, 'lib/config.js'))
const { muatPlugin, cariPlugin, ringkasPlugin } = await import(path.join(AKAR, 'lib/plugin-loader.js'))
const { periksaPlugin, daftarPerintah } = await import(path.join(AKAR, 'lib/plugin.js'))

test('opsiSocket: nilai dasar seragam', () => {
  const o = opsiSocket({ auth: { creds: {}, keys: {} } })
  assert.equal(o.connectTimeoutMs, 45000)
  assert.equal(o.keepAliveIntervalMs, 15000)
  assert.equal(o.defaultQueryTimeoutMs, 60000)
  assert.equal(o.maxMsgRetryCount, 10)
  assert.equal(ringkasOpsi(o).syncFullHistory, false)
})

test('opsiSocket: performance menimpa, nilai tidak sah diabaikan', () => {
  const o = opsiSocket({ auth: {}, performance: { connectTimeoutMs: 90000, keepAliveIntervalMs: 0 } })
  assert.equal(o.connectTimeoutMs, 90000)
  assert.equal(o.keepAliveIntervalMs, OPSI_DASAR.keepAliveIntervalMs)
})

test('opsiSocket: auth wajib', () => {
  assert.throws(() => opsiSocket({}), /wajib/)
})

test('konfigurasi bawaan masuk akal', () => {
  const k = bacaKonfig()
  assert.equal(k.prefix, '.')
  assert.equal(k.wajibPrefix, true)
  assert.ok(Array.isArray(k.owner))
  assert.equal(typeof KONFIG_BAWAAN.sessionDir, 'string')
})

test('semua plugin memenuhi kontrak', async () => {
  const plugins = await muatPlugin(path.join(AKAR, 'plugins'))
  assert.ok(plugins.length >= 5, `hanya ${plugins.length} plugin termuat`)
  for (const p of plugins) {
    const cek = periksaPlugin(p)
    assert.equal(cek.ok, true, `${p.berkas}: ${cek.masalah.join('; ')}`)
    assert.ok(p.perintah.length > 0, `${p.berkas} tanpa perintah`)
  }
})

test('pencarian perintah case-insensitive', async () => {
  const plugins = await muatPlugin(path.join(AKAR, 'plugins'))
  assert.ok(cariPlugin(plugins, 'halo'))
  assert.ok(cariPlugin(plugins, 'HALO'))
  assert.equal(cariPlugin(plugins, 'tidak-ada'), null)
})

test('plugin halo membalas sapaan', async () => {
  const plugins = await muatPlugin(path.join(AKAR, 'plugins'))
  let balasan = null
  await cariPlugin(plugins, 'halo')(
    { chat: 'x@s.whatsapp.net', sender: 'y@s.whatsapp.net', text: 'Budi', pushName: 'Budi', reply: async (t) => { balasan = t } },
    { usedPrefix: '.', command: 'halo', plugins }
  )
  assert.match(String(balasan), /Halo Budi/)
})

test('plugin echo menolak argumen kosong', async () => {
  const plugins = await muatPlugin(path.join(AKAR, 'plugins'))
  await assert.rejects(
    () => cariPlugin(plugins, 'echo')({ text: '', args: [], reply: async () => {} }, { usedPrefix: '.', command: 'echo' }),
    /Contoh:/
  )
})

test('ringkasPlugin siap dipakai menu', async () => {
  const plugins = await muatPlugin(path.join(AKAR, 'plugins'))
  const r = ringkasPlugin(plugins)
  assert.ok(r.every((x) => x.berkas && x.perintah.length && Array.isArray(x.tags)))
})

test('daftarPerintah & periksaPlugin', () => {
  assert.deepEqual(daftarPerintah({ command: /^(a|b)$/i }), ['a', 'b'])
  assert.equal(periksaPlugin(function () {}).ok, false)
})
