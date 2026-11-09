<script setup lang="ts">
import { computed } from 'vue';
import { ExternalLink, Globe, Loader2, ShieldCheck } from 'lucide-vue-next';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { allApiNodes, currentActiveOrigin } from '../../services/apiNodes';

const props = defineProps<{
  token: string;
  loadingProfile: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:token', value: string): void;
  (e: 'apply-token'): void;
  (e: 'open-api-selector'): void;
}>();

const currentNodeInfo = computed(() =>
  allApiNodes.value.find((n) => n.origin === currentActiveOrigin.value)
);

const activeHost = computed(() => {
  try {
    return new URL(currentActiveOrigin.value).host;
  } catch {
    return currentActiveOrigin.value;
  }
});

const tokenValue = computed({
  get: () => props.token,
  set: (value: string) => emit('update:token', value)
});
</script>

<template>
  <div class="flex h-full min-h-screen w-full items-center justify-center p-4">
    <Card class="relative w-full max-w-md border-2 bg-gradient-to-br from-card/90 to-card/70 shadow-lg backdrop-blur">
      <!-- Top right node selector pill -->
      <div class="absolute right-3 top-3">
        <Button
          variant="outline"
          size="sm"
          class="h-7 gap-1.5 px-2 text-[11px] font-mono text-muted-foreground hover:text-foreground"
          title="点击切换或测速后端 API 节点"
          @click="emit('open-api-selector')"
        >
          <Globe class="h-3 w-3 text-primary" />
          <span class="truncate max-w-[120px]">{{ activeHost }}</span>
          <span v-if="currentNodeInfo?.latencyMs" class="text-emerald-600 dark:text-emerald-400">
            {{ currentNodeInfo.latencyMs }}ms
          </span>
        </Button>
      </div>

      <CardHeader class="pt-8 text-center">
        <div class="mx-auto mb-2 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
          <ShieldCheck class="h-7 w-7 text-primary" />
        </div>
        <CardTitle class="text-2xl font-bold tracking-tight">连接采集中心</CardTitle>
        <CardDescription>用中心下发的采集节点 Token 接入弹幕归档</CardDescription>
      </CardHeader>
      <CardContent class="space-y-4">
        <div class="space-y-2">
          <label class="text-sm font-medium" for="core-token-input">采集节点 Token</label>
          <Input
            id="core-token-input"
            v-model="tokenValue"
            type="password"
            placeholder="粘贴中心后台创建的节点 Token"
            title="在中心后台「采集节点」页创建后获取，只显示一次"
            class="h-11"
            @keyup.enter="emit('apply-token')"
          />
        </div>

        <Button class="h-11 w-full" :disabled="loadingProfile" title="校验 Token 并加载该节点可录制的房间" @click="emit('apply-token')">
          <Loader2 v-if="loadingProfile" class="h-4 w-4 animate-spin" />
          <span>{{ loadingProfile ? '连接中...' : '连接中心' }}</span>
        </Button>

        <Button as-child variant="outline" class="h-11 w-full" title="前往中心后台创建采集节点并获取 Token">
          <a :href="`${currentActiveOrigin}/#/admin`" target="_blank" rel="noopener noreferrer">
            <ExternalLink class="h-4 w-4" />
            <span>打开中心后台创建 Token</span>
          </a>
        </Button>
      </CardContent>
    </Card>
  </div>
</template>
