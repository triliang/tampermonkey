// @vitest-environment jsdom
import {afterEach,it,expect,vi} from 'vitest';
import {h,render} from 'preact';
import {ExecutionCard,TargetCard} from './WorkflowCards';
import {emptyWorkflow} from '../../shared/v21-types';
let root=document.createElement('div');document.body.append(root);
afterEach(()=>{render(null,root);root.remove();root=document.createElement('div');document.body.append(root);});
it('结果卡只表达执行完成，保存与快捷反馈是独立用户动作',()=>{const save=vi.fn(),feedback=vi.fn();render(h(ExecutionCard,{onSave:save,onFeedback:feedback,onObserve:vi.fn(),busy:false}),root);expect(root.textContent).toContain('请检查页面效果');const buttons=[...root.querySelectorAll('button')];buttons.find(x=>x.textContent==='标签还在')!.click();expect(feedback).toHaveBeenCalledWith('标签还在');expect(save).not.toHaveBeenCalled();buttons.find(x=>x.textContent==='效果符合，保存')!.click();expect(save).toHaveBeenCalledOnce();});
it('简单整页不强制策略，模块与延时要求确认',()=>{const props={workflow:emptyWorkflow(),candidates:[],busy:false,onSelect:vi.fn(),onPreview:vi.fn(),onConfirm:vi.fn(),onTrigger:vi.fn(),onEffect:vi.fn()};render(h(TargetCard,props),root);expect(root.textContent).not.toContain('确认本轮策略');render(h(TargetCard,{...props,workflow:{...props.workflow,scope:'module'}}),root);expect(root.textContent).toContain('确认本轮策略');render(h(TargetCard,{...props,workflow:{...props.workflow,trigger:'delay'}}),root);expect(root.textContent).toContain('按需求延时执行');});
