import type {ControllerSpec} from '@forgesworn/joystick-protocol'
export const menuPhoneSpec: ControllerSpec = {version:1,name:'Gamestr Arcade',theme:{background:'#080B22',accent:'#b48cff'},slots:{joyL:{mode:'xy',label:'Browse'},A:{label:'Choose',icon:'✓'},B:{label:'Back',icon:'←'}}}
export const gamePhoneSpec: ControllerSpec = {version:1,name:'Gamestr game',slots:{joyL:{mode:'xy',label:'Move'},joyR:{mode:'xy',label:'Aim'},A:{},B:{},X:{},Y:{},L1:{},L2:{},R1:{},R2:{},start:{label:'Pause'},select:{label:'View'}}}
