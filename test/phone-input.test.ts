import {describe,it,expect} from 'vitest'
import {PhoneInputState,parsePhoneSnapshot,neutralPhone} from '../src/shared/phone-input'
import {menuPhoneSpec} from '../src/shared/ui/phone-controller'
describe('phone input boundary',()=> {
  it('maps declared XY/buttons and ignores undeclared or invalid input',()=> {
    const input=new PhoneInputState(menuPhoneSpec);input.reset(true)
    input.input('joyL-x','1000',10);input.input('joyL-y','-500',10);input.input('A','1',10)
    expect(input.snapshot(20).axes).toEqual([1,-.5,0,0]);expect(input.snapshot(20).buttons[0]).toBe(true)
    for(const [k,v] of [['joyR-x','1000'],['X','1'],['joyL-x','2000'],['joyL-x','NaN'],['A','2']])input.input(k,v,20)
    expect(input.snapshot(30).axes).toEqual([1,-.5,0,0]);expect(input.snapshot(30).buttons[2]).toBe(false)
    input.input('A','0',30);input.input('joyL-end','1',30);expect(input.snapshot(30).axes).toEqual([0,0,0,0]);expect(input.snapshot(30).buttons[0]).toBe(false)
  })
  it('maps heading/power and expires stale movement before resuming neutral',()=> {
    const input=new PhoneInputState({version:1,name:'Racer',slots:{joyL:{mode:'heading'},A:{}}});input.reset(true)
    input.input('joyL','0',0);input.input('joyL-power','1000',0);expect(input.snapshot(20).axes[0]).toBe(1)
    expect(input.snapshot(800).axes).toEqual([0,0,0,0]);input.reset(false);input.input('A','1',801);expect(input.snapshot(802)).toEqual(neutralPhone())
  })
  it('changes game profiles with released controls and validates IPC snapshots',()=> {
    const input=new PhoneInputState(menuPhoneSpec);input.reset(true);input.input('A','1',10);input.setSpec({version:1,name:'Game',slots:{B:{}}});expect(input.snapshot(20).buttons.every(v=>!v)).toBe(true)
    expect(parsePhoneSnapshot({...neutralPhone(),axes:[Infinity,0,0,0]})).toBeNull()
    expect(parsePhoneSnapshot({...neutralPhone(),extra:'sign-event'})).toBeNull()
    expect(parsePhoneSnapshot({...neutralPhone(),buttons:[true]})).toBeNull()
    expect(parsePhoneSnapshot({...neutralPhone(),axes:[1,0,0,0]})).toEqual(neutralPhone())
  })
})
