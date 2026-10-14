import {ARCADE_CONTROLLER_PROTOCOL,neutralPhone,type PhoneSnapshot} from '@forgesworn/joystick-protocol/browser'
import {isControllerSpec,type ControllerSpec} from '@forgesworn/joystick-protocol'
/** Bind only the exact publisher window the player just chose to open. */
export function bindPhoneGame(child: Window,targetOrigin: string,getInput:()=>PhoneSnapshot,setProfile:(profile:ControllerSpec)=>void,onClose:()=>void): ()=>void {
  let port:MessagePort|null=null,closed=false
  const expires=Date.now()+30000
  const stop=()=> {if(closed)return;closed=true;window.clearInterval(timer);window.removeEventListener('message',ready);window.removeEventListener('pagehide',stop);try{port?.postMessage({protocol:ARCADE_CONTROLLER_PROTOCOL,type:'input',state:neutralPhone()})}catch{}port?.close();port=null;onClose()}
  const ready=(event:MessageEvent)=> {
    if(closed || port || Date.now()>expires || event.origin!==targetOrigin || event.source!==child || event.data?.protocol!==ARCADE_CONTROLLER_PROTOCOL || event.data.type!=='ready' || !isControllerSpec(event.data.spec))return
    const channel=new MessageChannel();port=channel.port1;port.start()
    setProfile(event.data.spec)
    child.postMessage({protocol:ARCADE_CONTROLLER_PROTOCOL,type:'connect'},targetOrigin,[channel.port2])
  }
  window.addEventListener('message',ready);window.addEventListener('pagehide',stop)
  const timer=window.setInterval(()=> {
    if(child.closed || !port && Date.now()>expires){stop();return}
    if(port)try{port.postMessage({protocol:ARCADE_CONTROLLER_PROTOCOL,type:'input',state:getInput()})}catch{stop()}
  },100)
  return stop
}
