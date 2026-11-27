import test from 'node:test';
import assert from 'node:assert/strict';
import { consultarLaboratorioFacial, interpretarInfoLaboratorio } from './asistenciaFacialLab.js';
test('bloquea respuesta invalida',()=>assert.equal(interpretarInfoLaboratorio(null).conectado,false));
test('interpreta estado real del laboratorio',()=>assert.deepEqual(interpretarInfoLaboratorio({recognition:false,pad:false}).reconocimientoDisponible,false));
test('no confunde conectividad con autorizacion de marcacion',()=>assert.equal(interpretarInfoLaboratorio({recognition:true,pad:true}).motivo,'Requiere validacion institucional adicional'));
test('sin URL no hace conexiones',async()=>assert.equal((await consultarLaboratorioFacial(undefined)).conectado,false));
test('rechaza URL externa',async()=>assert.equal((await consultarLaboratorioFacial('https://ejemplo.com/')).conectado,false));
test('rechaza URL con credenciales',async()=>assert.equal((await consultarLaboratorioFacial('http://user:pass@localhost:3000/')).conectado,false));
test('consulta solamente /api/info',async()=>{
 let path='';
 const result=await consultarLaboratorioFacial('http://127.0.0.1:3999/',async u=>{path=u.pathname;return {ok:true,json:async()=>({recognition:false,pad:false})};});
 assert.equal(path,'/api/info');assert.equal(result.conectado,true);assert.equal(result.reconocimientoDisponible,false);
});
