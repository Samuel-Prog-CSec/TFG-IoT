import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '../../lib/utils';

/**
 * Input premium con efecto de glow en focus
 * 
 * @param {Object} props
 * @param {string} props.label - Label del input
 * @param {string} props.error - Mensaje de error
 * @param {string} props.hint - Texto de ayuda
 * @param {React.ReactNode} props.icon - Icono a mostrar
 * @param {'left' | 'right'} props.iconPosition - Posición del icono
 * @param {string} props.className - Clases adicionales para el contenedor
 * @param {string} props.inputClassName - Clases adicionales para el input
 */
export default function InputPremium({ 
  label,
  error,
  hint,
  icon,
  iconPosition = 'left',
  className,
  inputClassName,
  id,
  ...props 
}) {
  const [isFocused, setIsFocused] = useState(false);
  const generatedId = React.useId();
  const inputId = id || generatedId;

  return (
    <div className={cn('relative', className)}>
      {/* Label */}
      {label && (
        <label 
          htmlFor={inputId}
          className="block text-sm font-medium text-slate-300 mb-2"
        >
          {label}
        </label>
      )}
      
      {/* Input container */}
      <div className="relative">
        {/* Glow border on focus */}
        <AnimatePresence>
          {isFocused && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="absolute -inset-0.5 rounded-xl bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 opacity-50 blur-sm"
            />
          )}
        </AnimatePresence>
        
        {/* Icon left */}
        {icon && iconPosition === 'left' && (
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 z-10">
            {icon}
          </div>
        )}
        
        {/* Input */}
        <input
          id={inputId}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          className={cn(
            'relative w-full',
            'bg-slate-800/80 backdrop-blur-sm',
            'border border-white/10',
            'rounded-xl px-4 py-3',
            'text-white placeholder:text-slate-500',
            'transition-all duration-300',
            'focus:outline-none focus:border-transparent',
            icon && iconPosition === 'left' && 'pl-10',
            icon && iconPosition === 'right' && 'pr-10',
            error && 'border-rose-500/50',
            inputClassName
          )}
          {...props}
        />
        
        {/* Icon right */}
        {icon && iconPosition === 'right' && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 z-10">
            {icon}
          </div>
        )}
      </div>
      
      {/* Error message */}
      <AnimatePresence>
        {error && (
          <motion.p
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="mt-2 text-sm text-rose-400"
          >
            {error}
          </motion.p>
        )}
      </AnimatePresence>
      
      {/* Hint text */}
      {hint && !error && (
        <p className="mt-2 text-sm text-slate-500">{hint}</p>
      )}
    </div>
  );
}
