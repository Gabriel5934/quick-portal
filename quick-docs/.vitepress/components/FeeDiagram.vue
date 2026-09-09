<script setup>
import { onMounted, ref } from 'vue'

const container = ref(null)
const error = ref(false)
const source = `erDiagram
    OwnBasket ||--o{ OwnFee : "fees"
    OwnNetwork o|--o{ OwnFee : "fees"
    OwnChannel o|--o{ OwnFee : "fees"
    OwnMethod ||--o{ OwnFee : "fees"
    OwnFee ||--o{ OwnPlanFee : "plan_fees"
    OwnPlan ||--o{ OwnPlanFee : "fees"
    OwnBasket ||--o{ OwnPlan : "plans"
    OwnActivity ||--o{ OwnPlan : "plans"`

onMounted(async () => {
  try {
    const { default: mermaid } = await import('mermaid')
    mermaid.initialize({ startOnLoad: false, securityLevel: 'strict' })
    const { svg } = await mermaid.render('own-fee-relationships', source)
    container.value.innerHTML = svg
  } catch {
    error.value = true
  }
})
</script>

<template>
  <div ref="container" class="fee-diagram" role="img" aria-label="Relationships between OWN baskets, fees, networks, channels, methods, plans, and activities">
    <pre>{{ source }}</pre>
  </div>
  <p v-if="error">The diagram could not be rendered. Its relationship definitions are shown above.</p>
</template>

<style scoped>
.fee-diagram {
  overflow-x: auto;
  padding: 16px;
  background: white;
  border-radius: 8px;
  color: #213547;
}
</style>
