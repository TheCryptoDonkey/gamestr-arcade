import type {ControllerSpec} from '@forgesworn/joystick-protocol'
import {parsePhoneSnapshot,applyPhoneGamepad,neutralPhone,type PhoneSnapshot} from '@forgesworn/joystick-protocol/browser'
export {parsePhoneSnapshot,applyPhoneGamepad,neutralPhone,type PhoneSnapshot}
const indices: Record<string,number> = {A:0,B:1,X:2,Y:3,L1:4,R1:5,L2:6,R2:7,select:8,start:9,dpadU:12,dpadD:13,dpadL:14,dpadR:15}
export class PhoneInputState {
  private state = neutralPhone()
  private headings = [0,0]
  private powers = [0,0]
  private changed = [0,0]
  private spec: ControllerSpec
  constructor(spec: ControllerSpec) { this.spec = spec }
  setSpec(spec: ControllerSpec): void { this.spec = spec; this.reset(this.state.connected) }
  reset(connected = false): void { this.state = neutralPhone(); this.state.connected = connected; this.powers=[0,0]; this.changed=[0,0] }
  input(key: string,value: string,now: number): void {
    if(!this.state.connected || !/^-?\d{1,4}$/.test(value)) return
    const number = Number(value)
    if(indices[key] !== undefined && this.spec.slots[key as keyof typeof this.spec.slots]) {
      if(value === '0' || value === '1') this.state.buttons[indices[key]] = value === '1'
      return
    }
    const match = /^(joy[LR])(?:-(x|y|power|thrust|end|tap))?$/.exec(key)
    if(!match || !this.spec.slots[match[1] as 'joyL'|'joyR']) return
    const stick = match[1] === 'joyL' ? 0 : 1, axis = stick*2, mode = this.spec.slots[match[1] as 'joyL'|'joyR']?.mode ?? 'heading'
    if(match[2] === 'end' && value === '1' || match[2] === 'thrust' && value === '0') { this.state.axes[axis]=this.state.axes[axis+1]=0; this.powers[stick]=0; return }
    if(mode === 'xy' && (match[2] === 'x' || match[2] === 'y') && Math.abs(number)<=1000) this.state.axes[axis+(match[2] === 'y' ? 1 : 0)] = number/1000
    else if(!match[2] && Math.abs(number)<=3142) this.headings[stick] = number/1000
    else if(match[2] === 'power' && number >= 0 && number <= 1000) this.powers[stick] = number/1000
    else return
    this.changed[stick] = now
    if(mode !== 'xy') {this.state.axes[axis]=Math.cos(this.headings[stick])*this.powers[stick];this.state.axes[axis+1]=Math.sin(this.headings[stick])*this.powers[stick]}
  }
  snapshot(now: number): PhoneSnapshot {
    for(let i=0;i<2;i++) if(now-this.changed[i] > 750) { this.state.axes[i*2]=this.state.axes[i*2+1]=0; this.powers[i]=0 }
    return {connected:this.state.connected,axes:[...this.state.axes],buttons:[...this.state.buttons]}
  }
}

export function phoneAsGamepad(snapshot: PhoneSnapshot): Gamepad | null {
  if(!snapshot.connected) return null
  return {id:'Gamestr Joystick phone',index:0,connected:true,mapping:'standard',timestamp:performance.now(),axes:snapshot.axes,buttons:snapshot.buttons.map(pressed=>({pressed,touched:pressed,value:pressed ? 1 : 0}))} as unknown as Gamepad
}
