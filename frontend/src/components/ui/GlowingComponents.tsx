export function GlowingButton({ 
  children, 
  variant = 'primary', 
  className = '',
  ...props 
}: {
  children: React.ReactNode;
  variant?: 'primary' | 'secondary' | 'accent' | 'outline';
  className?: string;
  [key: string]: any;
}) {
  const baseStyles = 'px-6 py-3 rounded-lg font-semibold transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-dark-900';
  
  const variantStyles = {
    primary: 'bg-gradient-to-r from-primary-600 to-primary-500 text-white hover:shadow-glow-purple hover:from-primary-500 hover:to-primary-400',
    secondary: 'bg-gradient-to-r from-secondary-600 to-secondary-500 text-white hover:shadow-glow-green hover:from-secondary-500 hover:to-secondary-400',
    accent: 'bg-gradient-to-r from-accent-600 to-accent-500 text-dark-950 hover:shadow-glow-yellow hover:from-accent-500 hover:to-accent-400',
    outline: 'border-2 border-primary-500 text-primary-400 hover:bg-glow-purple hover:border-primary-400',
  };

  return (
    <button
      className={`${baseStyles} ${variantStyles[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

export function GlowingInput({
  label,
  error,
  className = '',
  ...props
}: {
  label?: string;
  error?: string;
  className?: string;
  [key: string]: any;
}) {
  return (
    <div className="w-full">
      {label && (
        <label className="block text-sm font-medium text-gray-300 mb-2">
          {label}
        </label>
      )}
      <input
        className={`w-full px-4 py-3 bg-dark-800/50 border border-gray-700/50 rounded-lg text-white placeholder-gray-500 focus:border-primary-500 focus:ring-2 focus:ring-primary-500/50 transition-all duration-200 backdrop-blur-sm ${className}`}
        {...props}
      />
      {error && <p className="text-red-400 text-sm mt-1">{error}</p>}
    </div>
  );
}

export function GlowingCard({
  children,
  className = '',
  glow = 'purple',
}: {
  children: React.ReactNode;
  className?: string;
  glow?: 'purple' | 'green' | 'yellow' | 'blue';
}) {
  const glowClasses = {
    purple: 'shadow-glow-purple',
    green: 'shadow-glow-green',
    yellow: 'shadow-glow-yellow',
    blue: 'shadow-glow-blue',
  };

  return (
    <div
      className={`card-glass ${glowClasses[glow]} ${className}`}
    >
      {children}
    </div>
  );
}

export function GradientText({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span className={`gradient-text ${className}`}>
      {children}
    </span>
  );
}

export function Badge({
  children,
  color = 'purple',
  className = '',
}: {
  children: React.ReactNode;
  color?: 'purple' | 'green' | 'yellow';
  className?: string;
}) {
  const colorClasses = {
    purple: 'bg-primary-900/50 text-primary-300 border-primary-700/50',
    green: 'bg-secondary-900/50 text-secondary-300 border-secondary-700/50',
    yellow: 'bg-accent-900/50 text-accent-300 border-accent-700/50',
  };

  return (
    <span className={`px-3 py-1 rounded-full text-sm border ${colorClasses[color]} ${className}`}>
      {children}
    </span>
  );
}

export function LoadingSpinner() {
  return (
    <div className="flex justify-center items-center">
      <div className="relative w-12 h-12">
        <div className="absolute inset-0 rounded-full border-4 border-gray-700/50"></div>
        <div
          className="absolute inset-0 rounded-full border-4 border-transparent border-t-primary-500 border-r-secondary-500 animate-spin"
        ></div>
      </div>
    </div>
  );
}

export function FloatingLabel({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="relative">
      <input
        type="text"
        value={value}
        readOnly
        className="hidden"
      />
      <span className="text-sm text-gray-400">{label}</span>
      <p className="text-lg font-semibold gradient-text">{value}</p>
    </div>
  );
}

export function Avatar({
  src,
  name,
  size = 'md',
}: {
  src?: string;
  name: string;
  size?: 'sm' | 'md' | 'lg';
}) {
  const sizeClasses = {
    sm: 'w-8 h-8 text-xs',
    md: 'w-12 h-12 text-sm',
    lg: 'w-16 h-16 text-base',
  };

  const initials = name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase();

  return (
    <div
      className={`${sizeClasses[size]} rounded-full flex items-center justify-center font-bold bg-gradient-to-br from-primary-600 to-secondary-600 text-white shadow-glow-purple`}
    >
      {src ? (
        <img src={src} alt={name} className="w-full h-full rounded-full object-cover" />
      ) : (
        initials
      )}
    </div>
  );
}
