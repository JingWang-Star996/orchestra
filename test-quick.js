const { Scratchpad, ScratchpadManager } = require('./scratchpad');

(async () => {
  console.log('✅ 模块加载成功');
  
  const sp = new Scratchpad('test-quick');
  console.log('✅ Scratchpad 创建成功');
  
  await sp.write('test', 'data');
  console.log('✅ 写入成功');
  
  const value = await sp.read('test');
  console.log('✅ 读取成功:', value);
  console.log('\n✅ Scratchpad 系统运行正常!');
})();
