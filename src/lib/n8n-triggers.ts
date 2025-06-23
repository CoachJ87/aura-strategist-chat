import { ProjectSession } from './supabase';

export async function triggerWorkflowOnCompletion(session: ProjectSession) {
  const webhookUrl = process.env.N8N_WEBHOOK_URL;
  
  if (!webhookUrl) {
    console.warn('N8N_WEBHOOK_URL not set. Skipping workflow trigger.');
    return;
  }

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        event: 'conversation_complete',
        session_id: session.id,
        project_id: session.project_id,
        completed_at: new Date().toISOString(),
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
  } catch (error) {
    console.error('Error triggering n8n workflow:', error);
  }
}
