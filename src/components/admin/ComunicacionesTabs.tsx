'use client'

import { useState } from 'react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import AdminEmails from './AdminEmails'
import AdminReminders from './AdminReminders'
import AdminSmtpConfig from './AdminSmtpConfig'

export default function ComunicacionesTabs() {
  const [tab, setTab] = useState('emails')
  return (
    <Tabs value={tab} onValueChange={setTab}>
      <TabsList>
        <TabsTrigger value="emails">Correos</TabsTrigger>
        <TabsTrigger value="renovaciones">Renovaciones</TabsTrigger>
        <TabsTrigger value="smtp">SMTP</TabsTrigger>
      </TabsList>
      <TabsContent value="emails">
        <AdminEmails />
      </TabsContent>
      <TabsContent value="renovaciones">
        <AdminReminders />
      </TabsContent>
      <TabsContent value="smtp">
        <AdminSmtpConfig />
      </TabsContent>
    </Tabs>
  )
}

