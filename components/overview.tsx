import { motion } from 'framer-motion';
import Image from 'next/image';

export const Overview = () => {
  return (
    <motion.div
      key="overview"
      className="max-w-3xl mx-auto md:mt-20"
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ delay: 0.5 }}
    >
      <div className="rounded-xl p-6 flex flex-col gap-8 leading-relaxed text-center max-w-xl">
        <div className="flex justify-center">
          <Image
            src="/images/Aura_logo.svg"
            alt="Aura Logo"
            width={200}
            height={58}
            className="dark:hidden"
          />
          <Image
            src="/images/Aura_logo_white.svg"
            alt="Aura Logo"
            width={200}
            height={58}
            className="hidden dark:block"
          />
        </div>
        <p className="text-xl">
          Welcome to Aura AI, what can I help you with today?
        </p>
      </div>
    </motion.div>
  );
};
