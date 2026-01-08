export default function ChartSection({ title, children }) {
    return (
        <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-slate-800/40 backdrop-blur-md p-6 rounded-2xl border border-white/5 h-full"
        >
            <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-bold text-white">{title}</h3>
                <select className="bg-slate-900 border border-white/10 text-slate-400 text-sm rounded-lg px-3 py-1 outline-none">
                    <option>Últimos 7 días</option>
                    <option>Últimos 30 días</option>
                </select>
            </div>
            {children}
        </motion.div>
    )
}
