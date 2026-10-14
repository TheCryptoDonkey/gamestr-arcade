import {test,expect} from '@playwright/test'
test('publisher handoff carries controls and a per-game profile through its own bounded channel',async({context,page})=> {
  const profile={version:1,name:'Publisher racer',slots:{joyL:{mode:'xy'},A:{label:'Brake'}},layout:{version:1,landscape:{joyL:{x:.2,y:.7,size:144},A:{x:.85,y:.7,size:64}}}}
  await context.route('http://127.0.0.1:4175/phone-game-test',route=>route.fulfill({contentType:'text/html',body:`<!doctype html><h1>Publisher game</h1><script type="module">import {installArcadeGameController} from '/@fs/${process.cwd()}/node_modules/@forgesworn/joystick-protocol/dist/browser.js'; installArcadeGameController({allowedOrigins:['http://127.0.0.1:4174'],profile:${JSON.stringify(profile)}});</script>`}))
  await page.goto('http://127.0.0.1:4174')
  const popupPromise=page.waitForEvent('popup')
  await page.evaluate(async()=> {
    const {bindPhoneGame}=await import('/phone-game-handoff.ts')
    const w=window as any; w.phoneState={connected:true,axes:[1,0,0,0],buttons:Array(17).fill(false)};w.phoneState.buttons[0]=true
    const child=window.open('http://127.0.0.1:4175/phone-game-test','_blank')!
    w.closePhoneChannel=bindPhoneGame(child,'http://127.0.0.1:4175',()=>w.phoneState,spec=>{w.phoneProfile=spec},()=>{w.phoneClosed=true})
  })
  const child=await popupPromise
  await expect.poll(()=>child.evaluate(()=>navigator.getGamepads()[0]?.id)).toBe('Gamestr Joystick phone')
  expect(await child.evaluate(()=>({axes:navigator.getGamepads()[0]?.axes,pressed:navigator.getGamepads()[0]?.buttons[0].pressed,signer:typeof (window as any).nostr}))).toEqual({axes:[1,0,0,0],pressed:true,signer:'undefined'})
  expect(await page.evaluate(()=>(window as any).phoneProfile)).toEqual(profile)
  await page.evaluate(()=>(window as any).phoneState={connected:true,axes:[0,0,0,0],buttons:Array(17).fill(false)})
  await expect.poll(()=>child.evaluate(()=>navigator.getGamepads()[0]?.buttons[0].pressed)).toBe(false)
  await page.evaluate(()=>(window as any).closePhoneChannel())
  await expect.poll(()=>child.evaluate(()=>navigator.getGamepads()[0]?.id ?? null)).toBeNull()
  await child.close()
})

test('pairing is explicit and does not request a Nostr signer',async({page})=> {
  await page.routeWebSocket('wss://controller.pallasite.app/**',socket=> {
    socket.onMessage(message=> {const frame=JSON.parse(String(message));if(frame.type==='host-join')socket.send(JSON.stringify({type:'host-ready'}))})
  })
  await page.goto('http://127.0.0.1:4174')
  await page.getByRole('button',{name:'Pair phone',exact:true}).click()
  await expect(page.getByRole('dialog',{name:'Pair your phone'})).toBeVisible()
  await expect(page.locator('.arcade-phone-code')).toHaveText(/^[A-Z]{3} [A-Z]{3}$/)
  await expect(page.getByRole('img',{name:'QR code to open Joystick'})).toHaveAttribute('src',/^data:image\/svg\+xml/)
  const href=await page.getByRole('link',{name:'Browser, iPhone, iPad and Android options'}).getAttribute('href')
  expect(href).toMatch(/^https:\/\/pad.forgesworn.dev\/get.html\?s=[A-Z]{6}/)
  expect(href).not.toContain('hostToken');expect(href).toContain('v=2')
  await page.getByRole('button',{name:'Disconnect phone',exact:true}).click()
  await expect(page.getByRole('status')).toHaveText('Disconnected')
})

test('phone navigation cannot activate account or payment approval controls',async({page})=> {
  await page.goto('http://127.0.0.1:4174')
  const result=await page.evaluate(async()=> {
    const {startCataloguePhoneInput}=await import('/phone-catalogue-input.ts')
    let pressed=false,approvals=0,plays=0
    const original=navigator.getGamepads.bind(navigator)
    Object.defineProperty(navigator,'getGamepads',{configurable:true,value:()=>[{connected:true,mapping:'standard',axes:[0,0,0,0],buttons:Array.from({length:17},(_,i)=>({pressed:i===0 && pressed,value:i===0 && pressed ? 1 : 0}))}]})
    const approval=document.createElement('button');approval.textContent='Approve payment';approval.onclick=()=>++approvals
    const dialog=document.createElement('dialog');dialog.append(approval);document.body.append(dialog);dialog.showModal();approval.focus()
    const stop=startCataloguePhoneInput(()=>false),wait=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms))
    const pulse=async()=> {pressed=true;await wait(80);pressed=false;await wait(50)}
    try {
      await pulse();dialog.close();document.body.append(approval);approval.focus();await pulse()
      const play=document.createElement('button');play.className='game-art';play.onclick=()=>++plays;document.getElementById('app')!.append(play);play.focus();await pulse();play.remove()
      return {approvals,plays}
    } finally {stop();Object.defineProperty(navigator,'getGamepads',{configurable:true,value:original});dialog.remove();approval.remove()}
  })
  expect(result).toEqual({approvals:0,plays:1})
})
