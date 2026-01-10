// Mock Data temporarily here, eventually from props or API
const studentProgressData = [
  { id: 1, name: 'Alex Johnson', progress: 92, status: 'Activo' },
  { id: 2, name: 'Sarah Williams', progress: 88, status: 'Activo' },
  { id: 3, name: 'Michael Brown', progress: 76, status: 'Desconectado' },
  { id: 4, name: 'Emily Davis', progress: 95, status: 'Activo' },
  { id: 5, name: 'James Wilson', progress: 62, status: 'Desconectado' },
];

export default function StudentsList() {
    return (
        <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="bg-slate-800/40 backdrop-blur-md p-6 rounded-2xl border border-white/5 h-full"
        >
            <h3 className="text-xl font-bold text-white mb-6">Mejores Estudiantes</h3>
            <div className="space-y-4">
                {studentProgressData.map((student) => (
                    <div key={student.id} className="flex items-center justify-between p-3 rounded-xl hover:bg-white/5 transition-colors group">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center text-white font-bold shadow-lg">
                                {student.name.charAt(0)}
                            </div>
                            <div>
                                <div className="text-white font-medium">{student.name}</div>
                                <div className="text-xs text-slate-400">{student.status}</div>
                            </div>
                        </div>
                        <div className="text-right">
                             <div className="text-emerald-400 font-bold">{student.progress}%</div>
                        </div>
                    </div>
                ))}
            </div>
             <button className="w-full mt-6 py-3 rounded-xl border border-dashed border-slate-600 text-slate-400 hover:text-white hover:border-slate-500 hover:bg-white/5 transition-all">
                Ver Todos
            </button>
        </motion.div>
    )
}
