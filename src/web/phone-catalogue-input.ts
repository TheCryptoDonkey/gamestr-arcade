import {InputController} from '../renderer/src/ui/input'
// Pairing grants game navigation/input. Account, signing and payment controls
// remain outside the phone's catalogue-navigation surface.
const targets='.game-art,.play-link,.site-nav a[href="/"],.site-nav a[href="/scores"]'
export function startCataloguePhoneInput(gameActive:()=>boolean): ()=>void {
  const permitted=(node:Element|null): node is HTMLElement => node instanceof HTMLElement && node.matches(targets) && !!node.closest('#app')
  const available=()=>!gameActive() && !document.querySelector('dialog[open]')
  const move=(direction:number)=> {
    if(!available())return
    const list=[...document.querySelectorAll<HTMLElement>(targets)].filter(node=>node.offsetWidth>0 && node.getAttribute('aria-disabled')!=='true')
    if(!list.length)return
    const index=list.indexOf(document.activeElement as HTMLElement),next=list[(index+direction+list.length)%list.length]
    next.focus();next.scrollIntoView({block:'nearest',behavior:'smooth'})
  }
  const input=new InputController({onPrev:()=>move(-1),onNext:()=>move(1),
    onLaunch:()=> {if(available() && permitted(document.activeElement))document.activeElement.click()},
    onBack:()=> {if(available())history.back()},
  },{keyboard:false})
  input.start();return ()=>input.stop()
}
