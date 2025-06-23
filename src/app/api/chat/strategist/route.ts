import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { generateResponse } from '@/lib/openai';
import { triggerWorkflowOnCompletion } from '@/lib/n8n-triggers';

export const runtime = 'nodejs';

type Message = {
  role: 'user' | 'assistant' | 'system';
  content: string;
};

type RequestBody = {
  message: string;
  session_id?: string;
  project_id: string;
  message_type: 'user_message';
};

export async function POST(request: Request) {
  try {
    const { message, session_id, project_id } = (await request.json()) as RequestBody;

    if (!message || !project_id) {
      return NextResponse.json(
        { success: false, message: 'Message and project_id are required' },
        { status: 400 }
      );
    }

    // Get or create session
    let session = session_id
      ? await getSession(session_id)
      : await createSession(project_id);

    if (!session) {
      return NextResponse.json(
        { success: false, message: 'Failed to create or retrieve session' },
        { status: 500 }
      );
    }

    // Update session with new message
    const sessionData = session.session_data;
    const now = new Date().toISOString();

    const updatedMessages = [
      ...sessionData.messages,
      { role: 'user' as const, content: message }
    ];

    // Generate AI response
    const { content: aiResponse, conversationComplete } = await generateResponse(
      [{ role: 'user' as const, content: message }],
      {
        messages: sessionData.messages,
        strategy_covered: sessionData.strategy_covered,
        created_at: sessionData.created_at,
        updated_at: now
      }
    );

    const updatedSessionData = {
      messages: [
        ...updatedMessages,
        { role: 'assistant' as const, content: aiResponse }
      ],
      strategy_covered: conversationComplete,
      created_at: sessionData.created_at,
      updated_at: now
    };

    // Update session with AI response
    const { data: updatedSession, error: updateError } = await supabase
      .from('project_sessions')
      .update({
        session_data: updatedSessionData,
        updated_at: now,
        ...(conversationComplete ? { completed_at: now } : {}),
      })
      .eq('id', session.id)
      .select()
      .single();

    if (updateError) throw updateError;

    // Trigger workflow if conversation is complete
    if (conversationComplete && updatedSession) {
      await triggerWorkflowOnCompletion(updatedSession);
    }

    return NextResponse.json({
      success: true,
      message: aiResponse,
      conversation_complete: conversationComplete,
      session_id: session.id,
    });
  } catch (error) {
    console.error('Error in strategist chat:', error);
    return NextResponse.json(
      { success: false, message: 'Internal server error' },
      { status: 500 }
    );
  }
}

async function getSession(sessionId: string) {
  const { data, error } = await supabase
    .from('project_sessions')
    .select('*')
    .eq('id', sessionId)
    .single();

  if (error) return null;
  return data;
}

async function createSession(projectId: string) {
  const initialData = {
    messages: [] as Message[],
    strategy_covered: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('project_sessions')
    .insert({
      project_id: projectId,
      session_data: initialData,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}
