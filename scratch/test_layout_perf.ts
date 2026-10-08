import { fetchAdapterData } from './analyze_scale';
import { runLayoutWithS, computeFramingDistance } from './test_solve_S';

async function testPerf() {
  const vxData = await fetchAdapterData('vaultx');
  const hpData = await fetchAdapterData('hospital');

  console.time('Hospital 2-pass');
  const hpRes0 = runLayoutWithS(hpData.nodes, hpData.edges, 'hospital', 1.0);
  const hpFrame0 = computeFramingDistance(hpRes0.positions, 'hospital');
  const S_hp = (hpFrame0 / 226.54) * (1.7126 / 3.0416);
  const hpResFinal = runLayoutWithS(hpData.nodes, hpData.edges, 'hospital', S_hp);
  console.timeEnd('Hospital 2-pass');

  console.time('VaultX 1-pass');
  const vxResFinal = runLayoutWithS(vxData.nodes, vxData.edges, 'vaultx', 1.0);
  console.timeEnd('VaultX 1-pass');

  console.log(`Hospital solved S = ${S_hp.toFixed(4)}`);
}

testPerf().catch(console.error);
