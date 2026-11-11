import { registerModule } from '@/core/modules';
import { coffeeModule } from './coffee/module';

let initialized = false;

export function ensureModulesRegistered(): void {
  if (initialized) return;
  registerModule(coffeeModule);
  initialized = true;
}

ensureModulesRegistered();
