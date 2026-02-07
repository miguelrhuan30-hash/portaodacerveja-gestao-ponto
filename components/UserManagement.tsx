
import React, { useState } from 'react';
import { UserPlus, Shield, Mail, Trash2, Edit3, CheckCircle2, XCircle, Lock, Eye, EyeOff, X, Save, Clock, Power } from 'lucide-react';
import { SystemUser, PermissionSet } from '../types';

interface UserManagementProps {
  users: SystemUser[];
  onUpdateUser: (user: SystemUser) => void;
  onAddUser: (user: SystemUser) => void;
  onDeleteUser: (userId: string) => void;
}

const UserManagement: React.FC<UserManagementProps> = ({ users, onUpdateUser, onAddUser, onDeleteUser }) => {
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingUser, setEditingUser] = useState<SystemUser | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [newUser, setNewUser] = useState({ 
    name: '', 
    email: '', 
    password: '',
    role: 'EMPLOYEE' as SystemUser['role'],
    weeklyHoursGoal: 44
  });

  // Mostramos apenas os usuários ativos na lista de gestão
  const activeUsers = users.filter(user => user.active === true);

  const togglePermission = (user: SystemUser, permission: keyof PermissionSet) => {
    if (user.role === 'MASTER') return;
    const updatedUser: SystemUser = {
      ...user,
      permissions: {
        ...user.permissions,
        [permission]: !user.permissions[permission]
      }
    };
    onUpdateUser(updatedUser);
  };

  const toggleUserStatus = (user: SystemUser) => {
    if (user.role === 'MASTER') return;
    onUpdateUser({ ...user, active: !user.active });
  };

  const handleCreateUser = () => {
    if (!newUser.name || !newUser.email || !newUser.password) {
      alert("Preencha todos os campos obrigatórios.");
      return;
    }
    const user: SystemUser = {
      id: Math.random().toString(36).substr(2, 9),
      name: newUser.name.trim(),
      email: newUser.email.trim().toLowerCase(),
      password: newUser.password,
      role: newUser.role,
      active: true,
      weeklyHoursGoal: newUser.weeklyHoursGoal,
      permissions: {
        canManageTasks: newUser.role !== 'EMPLOYEE',
        canRecordAttendance: true,
        canViewReports: newUser.role === 'ADMIN',
        canManageUsers: false,
        canManageShortages: true
      }
    };
    onAddUser(user);
    setNewUser({ name: '', email: '', password: '', role: 'EMPLOYEE', weeklyHoursGoal: 44 });
    setShowAddModal(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-2xl font-bold text-slate-800">Colaboradores</h3>
          <p className="text-slate-500">Gerencie a equipe e metas de acesso.</p>
        </div>
        <button 
          onClick={() => setShowAddModal(true)}
          className="bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 rounded-xl flex items-center gap-2 font-bold transition-all shadow-lg"
        >
          <UserPlus size={20} />
          Convidar Usuário
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {activeUsers.map(user => (
          <div key={user.id} className="bg-white rounded-2xl border border-slate-200 p-6 flex flex-col lg:flex-row lg:items-center gap-6 group hover:border-amber-400 transition-all shadow-sm">
            <div className="flex items-center gap-4 lg:w-1/4">
              <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 font-bold border-2 border-slate-50 overflow-hidden shrink-0">
                {user.avatar ? (
                  <img src={user.avatar} className="w-full h-full object-cover scale-x-[-1]" />
                ) : (
                  user.name.split(' ').map(n => n[0]).join('').toUpperCase()
                )}
              </div>
              <div className="truncate">
                <h4 className="font-bold text-slate-800 truncate">{user.name}</h4>
                <p className="text-xs text-slate-400 truncate">{user.email}</p>
              </div>
            </div>

            <div className="flex-1 flex flex-wrap gap-2">
              {[
                { key: 'canManageTasks', label: 'Tarefas' },
                { key: 'canRecordAttendance', label: 'Ponto' },
                { key: 'canViewReports', label: 'Gestão' },
                { key: 'canManageShortages', label: 'Estoque' }
              ].map(p => (
                <button
                  key={p.key}
                  disabled={user.role === 'MASTER'}
                  onClick={() => togglePermission(user, p.key as keyof PermissionSet)}
                  className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase flex items-center gap-2 border transition-all ${user.permissions[p.key as keyof PermissionSet] ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-slate-50 border-slate-100 text-slate-400'}`}
                >
                  {user.permissions[p.key as keyof PermissionSet] ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
                  {p.label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-3 lg:w-1/6 justify-end">
               <button 
                 onClick={() => toggleUserStatus(user)}
                 title={user.active ? "Desativar Temporariamente" : "Ativar"}
                 className={`p-2 rounded-lg transition-colors ${user.active ? 'text-emerald-500 hover:bg-emerald-50' : 'text-rose-500 hover:bg-rose-50'}`}
               >
                 <Power size={20} />
               </button>
               {user.role !== 'MASTER' && (
                 <button 
                  onClick={() => { if(confirm(`Tem certeza que deseja remover ${user.name}? O usuário perderá o acesso imediatamente.`)) onDeleteUser(user.id); }}
                  className="p-2 text-slate-300 hover:text-rose-600 transition-colors bg-slate-50 hover:bg-rose-100 rounded-lg"
                  title="Excluir Usuário"
                 >
                   <Trash2 size={20} />
                 </button>
               )}
            </div>
          </div>
        ))}
        {activeUsers.length === 0 && (
          <div className="p-20 text-center text-slate-400 border-2 border-dashed border-slate-200 rounded-[2.5rem]">
             <p className="font-bold uppercase tracking-widest text-sm">Nenhum colaborador ativo</p>
          </div>
        )}
      </div>

      {showAddModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
          <div className="bg-white rounded-[2.5rem] w-full max-w-md overflow-hidden shadow-2xl animate-in zoom-in-95">
            <div className="p-6 bg-amber-600 text-white flex justify-between items-center">
              <h3 className="text-xl font-black">Novo Colaborador</h3>
              <button onClick={() => setShowAddModal(false)}><X size={24} /></button>
            </div>
            <div className="p-8 space-y-4">
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Nome Completo</label>
                <input 
                  type="text" 
                  value={newUser.name} 
                  onChange={e => setNewUser({...newUser, name: e.target.value})} 
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none text-slate-900 placeholder:text-slate-400"
                  placeholder="Ex: João da Silva"
                />
              </div>
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">E-mail Corporativo</label>
                <input 
                  type="email" 
                  value={newUser.email} 
                  onChange={e => setNewUser({...newUser, email: e.target.value})} 
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none text-slate-900 placeholder:text-slate-400"
                  placeholder="joao@empresa.com"
                />
              </div>
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Senha Provisória</label>
                <input 
                  type="password" 
                  value={newUser.password} 
                  onChange={e => setNewUser({...newUser, password: e.target.value})} 
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none text-slate-900 placeholder:text-slate-400"
                  placeholder="******"
                />
              </div>
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Cargo / Perfil</label>
                <select 
                  value={newUser.role} 
                  onChange={e => setNewUser({...newUser, role: e.target.value as any})} 
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none text-slate-900 font-bold"
                >
                  <option value="EMPLOYEE">Funcionário</option>
                  <option value="ADMIN">Administrador</option>
                </select>
              </div>
              <button onClick={handleCreateUser} className="w-full bg-amber-600 text-white py-4 rounded-xl font-black mt-4 shadow-lg active:scale-95 transition-all">
                CADASTRAR USUÁRIO
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserManagement;
