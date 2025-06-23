import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { generateResponse } from '@/lib/openai';
import { triggerWorkflowOnCompletion } from '@/lib/n8n-triggers';

// Helper to mask sensitive data in logs
function maskSensitiveData(obj: Record<string, any>): Record<string, any> {
  const masked = { ...obj };
  const sensitiveKeys = ['key', 'password', 'secret', 'token', 'authorization'];
  
  for (const key in masked) {
    if (sensitiveKeys.some(k => key.toLowerCase().includes(k))) {
      masked[key] = '***MASKED***';
    } else if (typeof masked[key] === 'object' && masked[key] !== null) {
      masked[key] = maskSensitiveData(masked[key]);
    }
  }
  return masked;
}

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

// Test endpoint to verify Supabase connection
// GET /api/chat/strategist
// Returns connection status and environment info
export async function GET() {
  console.log('Running Supabase connection test...');
  try {
    const { data, error } = await supabase
      .from('project_sessions')
      .select('count')
      .limit(1);
      
    const result = {
      supabase_connected: !error,
      error: error?.message,
      env_check: {
        has_supabase_url: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
        has_supabase_key: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
        node_env: process.env.NODE_ENV,
      },
      tables: {
        project_sessions: !!data,
      }
    };
    
    console.log('Supabase test result:', maskSensitiveData(result));
    return NextResponse.json(result);
  } catch (err) {
    console.error('Supabase test failed:', err);
    return NextResponse.json({ 
      error: String(err),
      stack: (err as Error).stack,
      env: maskSensitiveData(process.env)
    }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const requestStartTime = Date.now();
  const requestId = Math.random().toString(36).substring(2, 15);
  
  console.log(`[${requestId}] New request received`);
  
  try {
    const body = await request.json() as RequestBody;
    console.log(`[${requestId}] Request body:`, maskSensitiveData(body));
    
    const { message, session_id, project_id } = body;
    
    if (!message || !project_id) {
      const error = { message: 'Message and project_id are required', received: { message: !!message, project_id: !!project_id } };
      console.error(`[${requestId}] Validation error:`, error);
      return NextResponse.json(
        { success: false, ...error },
        { status: 400 }
      );
    }
    
    console.log(`[${requestId}] Environment check:`, {
      has_supabase_url: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
      has_supabase_key: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      node_env: process.env.NODE_ENV,
    });

    if (!message || !project_id) {
      return NextResponse.json(
        { success: false, message: 'Message and project_id are required' },
        { status: 400 }
      );
    }

    // Get or create session
    console.log(`[${requestId}] ${session_id ? 'Getting' : 'Creating'} session...`);
    let session;
    let sessionError;
    
    try {
      session = session_id
        ? await getSession(session_id)
        : await createSession(project_id);
        
      console.log(`[${requestId}] Session ${session ? 'retrieved/created' : 'not found'}:`, 
        session ? { id: session.id, project_id: session.project_id } : null);
        
      if (!session) {
        sessionError = new Error(`Failed to ${session_id ? 'retrieve' : 'create'} session`);
        console.error(`[${requestId}] Session error:`, sessionError);
        return NextResponse.json(
          { 
            success: false, 
            message: 'Failed to create or retrieve session',
            error: sessionError.message,
            session_id,
            project_id
          },
          { status: 500 }
        );
      }
    } catch (error) {
      console.error(`[${requestId}] Session operation failed:`, {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        session_id,
        project_id
      });
      throw error;
    }

    // Update session with new message
    const sessionData = session.session_data;
    const now = new Date().toISOString();
    
    console.log(`[${requestId}] Updating session with new message`, {
      session_id: session.id,
      existing_messages_count: sessionData.messages?.length || 0,
      message_length: message.length,
      timestamp: now
    });

    const updatedMessages = [
      ...sessionData.messages,
      { role: 'user' as const, content: message }
    ];

    // Generate AI response
    console.log(`[${requestId}] Generating AI response...`);
    let aiResponse;
    let conversationComplete = false;
    
    try {
      const response = await generateResponse(
        [{ role: 'user' as const, content: message }],
        {
          messages: sessionData.messages,
          strategy_covered: sessionData.strategy_covered,
          created_at: sessionData.created_at,
          updated_at: now
        }
      );
      
      aiResponse = response.content;
      conversationComplete = response.conversationComplete;
      
      console.log(`[${requestId}] AI response generated`, {
        response_length: aiResponse?.length,
        conversation_complete: conversationComplete
      });
    } catch (error) {
      console.error(`[${requestId}] AI generation failed:`, {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        message_length: message.length,
        session_id: session.id
      });
      throw error;
    }

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
    console.log(`[${requestId}] Updating session with AI response...`);
    let updatedSession;
    
    try {
      const updateResult = await supabase
        .from('project_sessions')
        .update({
          session_data: updatedSessionData,
          updated_at: now,
          ...(conversationComplete ? { completed_at: now } : {}),
        })
        .eq('id', session.id)
        .select()
        .single();

      console.log(`[${requestId}] Session update result:`, {
        has_data: !!updateResult.data,
        has_error: !!updateResult.error,
        error: updateResult.error ? updateResult.error.message : null,
        session_id: session.id
      });

      if (updateResult.error) {
        throw updateResult.error;
      }
      
      updatedSession = updateResult.data;
    } catch (error) {
      console.error(`[${requestId}] Failed to update session:`, {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        session_id: session.id,
        update_data: maskSensitiveData(updatedSessionData)
      });
      throw error;
    }

    // Trigger workflow if conversation is complete
    if (conversationComplete && updatedSession) {
      console.log(`[${requestId}] Conversation complete, triggering workflow...`);
      try {
        await triggerWorkflowOnCompletion(updatedSession);
        console.log(`[${requestId}] Workflow triggered successfully`);
      } catch (error) {
        console.error(`[${requestId}] Workflow trigger failed:`, {
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
          session_id: session.id
        });
        // Don't fail the request if workflow trigger fails
      }
    }

    return NextResponse.json({
      success: true,
      message: aiResponse,
      conversation_complete: conversationComplete,
      session_id: session.id,
    });
  } catch (error) {
    const errorId = Math.random().toString(36).substring(2, 8);
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    
    console.error(`[${requestId}] [${errorId}] Error in strategist chat:`, {
      message: errorMessage,
      stack: errorStack,
      error: maskSensitiveData(error as Record<string, any>),
      request: {
        method: 'POST',
        url: request.url,
        headers: maskSensitiveData(Object.fromEntries(request.headers.entries()))
      },
      timestamp: new Date().toISOString()
    });
    
    return NextResponse.json(
      { 
        success: false, 
        message: 'Internal server error',
        error_id: errorId,
        error: process.env.NODE_ENV === 'development' ? errorMessage : undefined,
        stack: process.env.NODE_ENV === 'development' ? errorStack : undefined
      },
      { status: 500 }
    );
  } finally {
    console.log(`[${requestId}] Request completed in ${Date.now() - requestStartTime}ms`);
  }
}

async function getSession(sessionId: string) {
  console.log(`Getting session: ${sessionId}`);
  try {
    const { data, error } = await supabase
      .from('project_sessions')
      .select('*')
      .eq('id', sessionId)
      .single();

    if (error) {
      console.error('Error getting session:', {
        error: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint,
        sessionId
      });
      return null;
    }
    
    console.log(`Session retrieved: ${sessionId}`, {
      project_id: data?.project_id,
      created_at: data?.created_at,
      message_count: data?.session_data?.messages?.length || 0
    });
    
    return data;
  } catch (error) {
    console.error('Unexpected error in getSession:', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      sessionId
    });
    throw error;
  }
}

async function createSession(projectId: string) {
  const requestId = Math.random().toString(36).substring(2, 8);
  console.log(`[${requestId}] Creating session for project:`, projectId);
  
  const initialData = {
    messages: [] as Message[],
    strategy_covered: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  console.log(`[${requestId}] Initial session data:`, initialData);

  try {
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

    console.log(`[${requestId}] Supabase insert result:`, { 
      has_data: !!data, 
      has_error: !!error,
      error: error ? maskSensitiveData(error) : null
    });
    
    if (error) {
      console.error(`[${requestId}] Supabase error details:`, {
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint,
        project_id: projectId
      });
      throw error;
    }
    
    console.log(`[${requestId}] Session created successfully:`, { 
      session_id: data?.id,
      project_id: data?.project_id 
    });
    
    return data;
  } catch (err) {
    console.error(`[${requestId}] Full error in createSession:`, {
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
      project_id: projectId,
      timestamp: new Date().toISOString()
    });
    throw err;
  }
}
