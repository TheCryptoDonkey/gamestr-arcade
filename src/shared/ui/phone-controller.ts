import {type ControllerHost} from '@forgesworn/joystick-host'
import {formatPairingCode,isControllerSpec,type ControllerSpec} from '@forgesworn/joystick-protocol'
import {PhoneInputState,neutralPhone,type PhoneSnapshot} from '../phone-input'
import './phone-controller.css'
import {menuPhoneSpec} from '../phone-specs'
import {DEFAULT_CONTROLLER_RELAY} from '../controller-relay'
export {menuPhoneSpec,gamePhoneSpec} from '../phone-specs'
export interface ArcadePhoneController {
  readonly paired: boolean
  readonly snapshot: PhoneSnapshot
  setSpec(spec: ControllerSpec): void
  disconnect(): void
  dispose(): void
}
/** `relay` names the controller relay at pairing time (the SDK has no default); it may change after the config loads. */
export function mountPhoneController(onInput: (snapshot:PhoneSnapshot)=>void,relay:()=>string=()=>DEFAULT_CONTROLLER_RELAY): ArcadePhoneController {
  let host:ControllerHost|null = null, spec = menuPhoneSpec, paired = false, previous = '', snapshot = neutralPhone()
  const input = new PhoneInputState(spec)
  const opener = document.createElement('button'); opener.type='button'; opener.className='arcade-phone-open'; opener.textContent='Pair phone'; document.body.append(opener)
  const dialog = document.createElement('dialog'); dialog.className='arcade-phone-dialog'; dialog.setAttribute('aria-label','Pair your phone')
  const title = document.createElement('h2');title.textContent='Your phone is the controller'
  const intro = document.createElement('p');intro.textContent='Scan to play in your browser. No download needed.'
  const qrImage = document.createElement('img');qrImage.alt='QR code to open Joystick';qrImage.width=224;qrImage.height=224
  const code = document.createElement('strong');code.className='arcade-phone-code'
  const status = document.createElement('p');status.setAttribute('role','status')
  const apps = document.createElement('a');apps.textContent='Browser, iPhone, iPad and Android options';apps.target='_blank';apps.rel='noopener noreferrer'
  const close = document.createElement('button');close.type='button';close.textContent='Close';close.onclick=()=>dialog.close()
  const disconnect = document.createElement('button');disconnect.type='button';disconnect.textContent='Disconnect phone'
  dialog.append(title,intro,qrImage,code,status,apps,close,disconnect);document.body.append(dialog)
  const emit = ()=> {snapshot=input.snapshot(performance.now());const json=JSON.stringify(snapshot);if(json!==previous){previous=json;onInput(snapshot)}}
  const reset = (connected:boolean)=> {paired=connected;input.reset(connected);emit();opener.textContent=connected ? 'Phone connected' : 'Pair phone'}
  const leave = ()=> {host?.close();host=null;reset(false);status.textContent='Disconnected';code.textContent='';qrImage.removeAttribute('src')}
  disconnect.onclick=leave
  opener.onclick=async()=> {
    if(!host) {
      const {startControllerHost}=await import('@forgesworn/joystick-host')
      host=startControllerHost({ws:relay(),protocolVersion:2,pwaUrl:'https://pad.forgesworn.dev/'})
      host.setSpec(spec)
      input.setSpec(spec)
      code.textContent=formatPairingCode(host.sessionId)
      const url=new URL(host.pairingUrl);url.pathname='/get.html';apps.href=url.href
      status.textContent='Connecting to controller service…'
      host.onInput(frame=> {input.input(frame.k,frame.v,performance.now());emit()})
      host.onStatus(state=> {
        reset(state.kind==='paired');status.textContent=state.kind==='paired' ? 'Phone connected · ready to play' : state.kind==='waiting' ? 'Scan the QR or enter this code in Joystick' : state.kind==='reconnecting' ? 'Reconnecting · controls released' : state.kind==='closed' ? 'Controller service unavailable · retry pairing' : 'Connecting…'
        if(state.kind==='paired') dialog.close()
      })
      host.onPlayerSuspend(()=>reset(false));host.onPlayerLeave(()=>reset(false))
      if(!dialog.open && !paired)dialog.showModal()
      const active=host
      const {default:qrcode}=await import('qrcode-generator')
      if(host!==active)return
      const qr=qrcode(0,'M');qr.addData(active.pairingUrl);qr.make();qrImage.src=`data:image/svg+xml;charset=utf-8,${encodeURIComponent(qr.createSvgTag({scalable:true,margin:2}))}`
    }
    if(!dialog.open && !paired)dialog.showModal()
  }
  const timer=window.setInterval(emit,50)
  window.addEventListener('pagehide',leave)
  return {get paired(){return paired},get snapshot(){return snapshot},setSpec(next){if(!isControllerSpec(next))return;spec=next;input.setSpec(next);host?.setSpec(next);emit()},disconnect:leave,dispose(){window.clearInterval(timer);window.removeEventListener('pagehide',leave);leave();opener.remove();dialog.remove()}}
}
