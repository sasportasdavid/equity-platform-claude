import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { corsHeaders } from '../_shared/cors.ts';

const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const systemPrompt = `Tu es CapiwiseCoach, l'assistant IA premium de Capiwise.

🎯 RÔLE
- Expert Comp&Ben et Equity/BSPCE
- Coach Manager et pédagogue pour employés
- Auditeur technique (cohérence plans, KPIs, barèmes)
- Capable d'appeler des tools pour calculer, simuler, auditer

📋 RÈGLES DE CONFIDENTIALITÉ STRICTES
- Tu ne dois JAMAIS révéler, résumer ni comparer des données auxquelles l'utilisateur n'a pas accès selon ses droits
- Ne réponds qu'à partir du context fourni (equity, incentive, teamPerformance)
- Si une information n'est pas dans ce contexte, considère qu'elle n'est pas accessible
- Si l'utilisateur demande des informations hors de son périmètre (autres employés, autres équipes, autre société), réponds :
  * "Je ne peux pas accéder à ces données avec vos droits actuels"
  * Puis propose une explication générale sans citer de chiffres ou de noms précis
- Ne fais jamais de suppositions ou d'estimations chiffrées sur les données d'autres personnes

🎯 COMPORTEMENT
- Toujours raisonner sur les données réelles fournies en contexte
- Ne jamais inventer de données
- Adapter le langage selon le rôle du user (employee/manager/admin)
- Toujours proposer des actions concrètes
- Si un tool existe pour une action → l'utiliser
- Réponses concises et actionnables`;

// Tools disponibles
const tools = [
  {
    type: 'function',
    function: {
      name: 'coach_simulate_incentive',
      description: "Simule le payout d'un plan d'incentive avec différents niveaux de performance",
      parameters: {
        type: 'object',
        properties: {
          planId: { type: 'string', description: 'ID du plan à simuler' },
          quotaPercentage: {
            type: 'number',
            description: 'Pourcentage de quota atteint (ex: 150 pour 150%)',
          },
          mboPercentage: { type: 'number', description: 'Pourcentage MBO atteint (optionnel)' },
        },
        required: ['planId', 'quotaPercentage'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'coach_explain_realization',
      description: "Explique en détail le calcul d'un payout réalisé",
      parameters: {
        type: 'object',
        properties: {
          realizationId: { type: 'string', description: 'ID de la réalisation à expliquer' },
        },
        required: ['realizationId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'coach_get_suggestions',
      description: 'Obtient des suggestions contextuelles basées sur la situation actuelle du user',
      parameters: {
        type: 'object',
        properties: {
          contextType: { type: 'string', enum: ['equity', 'incentive', 'global'] },
        },
        required: ['contextType'],
      },
    },
  },
];

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Authentication
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const token = authHeader.replace('Bearer ', '');
    const supabaseClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    // Get user from JWT
    const {
      data: { user },
      error: userError,
    } = await supabaseClient.auth.getUser(token);
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get user context (company, roles, stakeholder)
    const { data: profile } = await supabaseClient
      .from('profiles')
      .select('company_id')
      .eq('id', user.id)
      .single();

    if (!profile?.company_id) {
      return new Response(JSON.stringify({ error: 'User not associated with a company' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const companyId = profile.company_id;

    // Get user roles
    const { data: membership } = await supabaseClient
      .from('memberships')
      .select('role')
      .eq('user_id', user.id)
      .eq('company_id', companyId)
      .single();

    const userRole = membership?.role || 'employee';

    // Get stakeholder
    const { data: stakeholder } = await supabaseClient
      .from('stakeholders')
      .select('id')
      .eq('user_id', user.id)
      .eq('company_id', companyId)
      .maybeSingle();

    const stakeholderId = stakeholder?.id;

    const { message, sessionId, contextType, module, toolCall } = await req.json();

    // Handle tool calls
    if (toolCall) {
      return await handleToolCall(toolCall, {
        supabaseClient,
        companyId,
        userId: user.id,
        stakeholderId,
        userRole,
      });
    }

    // Load context based on contextType and permissions
    const context = await loadContext({
      supabaseClient,
      contextType,
      companyId,
      userId: user.id,
      stakeholderId,
      userRole,
    });

    // Create or get session
    let currentSessionId = sessionId;
    if (!currentSessionId) {
      const { data: newSession } = await supabaseClient
        .from('ai_chat_sessions')
        .insert({
          user_id: user.id,
          company_id: companyId,
          context_type: contextType,
          prompt_key: 'capiwise_coach',
          context_data: context,
        })
        .select()
        .single();

      currentSessionId = newSession?.id;
    }

    // Save user message
    if (currentSessionId) {
      await supabaseClient.from('ai_chat_messages').insert({
        session_id: currentSessionId,
        role: 'user',
        content: message,
      });
    }

    // Call Lovable AI
    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          {
            role: 'system',
            content: `Context utilisateur:\nRôle: ${userRole}\nModule: ${module}\nContext type: ${contextType}\n\nDonnées accessibles:\n${JSON.stringify(context, null, 2)}`,
          },
          { role: 'user', content: message },
        ],
        tools,
        temperature: 0.4,
        max_tokens: 1500,
        stream: true,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Lovable AI error:', response.status, errorText);

      if (response.status === 429) {
        return new Response(
          JSON.stringify({
            error: 'Limite de requêtes atteinte. Veuillez réessayer dans quelques instants.',
          }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }

      throw new Error(`AI error: ${response.status}`);
    }

    // Stream response
    const stream = new ReadableStream({
      async start(controller) {
        const reader = response.body?.getReader();
        const decoder = new TextDecoder();
        let assistantMessage = '';

        try {
          while (true) {
            const { done, value } = await reader!.read();
            if (done) break;

            const chunk = decoder.decode(value);
            const lines = chunk.split('\n').filter((line) => line.trim());

            for (const line of lines) {
              if (line.startsWith('data: ')) {
                const data = line.slice(6);
                if (data === '[DONE]') continue;

                try {
                  const parsed = JSON.parse(data);
                  const content = parsed.choices?.[0]?.delta?.content;

                  if (content) {
                    assistantMessage += content;
                    controller.enqueue(
                      new TextEncoder().encode(`data: ${JSON.stringify({ content })}\n\n`),
                    );
                  }
                } catch (e) {
                  // Ignore parse errors for partial chunks
                }
              }
            }
          }

          // Save assistant message
          if (currentSessionId && assistantMessage) {
            await supabaseClient.from('ai_chat_messages').insert({
              session_id: currentSessionId,
              role: 'assistant',
              content: assistantMessage,
            });
          }

          controller.enqueue(
            new TextEncoder().encode(
              `data: ${JSON.stringify({ done: true, session_id: currentSessionId })}\n\n`,
            ),
          );
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  } catch (error) {
    console.error('Coach error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});

async function loadContext({
  supabaseClient,
  contextType,
  companyId,
  userId,
  stakeholderId,
  userRole,
}: any) {
  const context: any = { role: userRole };

  if (contextType === 'incentive' || contextType === 'global') {
    // Load incentive context based on role
    if (userRole === 'employee' && stakeholderId) {
      // Employee: only their own data
      const { data: plans } = await supabaseClient
        .from('incentive_plan_participants_v4')
        .select('*, incentive_plans_v4(*)')
        .eq('stakeholder_id', stakeholderId)
        .eq('status', 'active');

      const { data: results } = await supabaseClient
        .from('incentive_results_v4')
        .select('*')
        .eq('stakeholder_id', stakeholderId)
        .order('period_id', { ascending: false })
        .limit(3);

      context.incentive = { myPlans: plans, myResults: results };
    } else if (userRole === 'manager' && stakeholderId) {
      // Manager: their data + their team
      // TODO: Implement team filtering via team_managers/manager_assignments
      context.incentive = { role: 'manager', note: 'Team context to be implemented' };
    } else if (['admin', 'hr', 'compensation'].includes(userRole)) {
      // Admin/HR: company-wide summary
      const { data: activePlans } = await supabaseClient
        .from('incentive_plans_v4')
        .select('id, name, status, plan_type')
        .eq('company_id', companyId)
        .eq('status', 'active');

      context.incentive = { activePlans };
    }
  }

  if (contextType === 'equity' || contextType === 'global') {
    // Load equity context based on role
    if (userRole === 'employee' && stakeholderId) {
      const { data: grants } = await supabaseClient
        .from('grants')
        .select('*')
        .eq('stakeholder_id', stakeholderId)
        .eq('status', 'active');

      context.equity = { myGrants: grants };
    } else if (['admin', 'finance'].includes(userRole)) {
      // Admin/Finance: summary only
      const { data: activePlans } = await supabaseClient
        .from('plans')
        .select('id, name, plan_type, status')
        .eq('company_id', companyId)
        .in('status', ['active', 'approved']);

      context.equity = { activePlans };
    }
  }

  return context;
}

async function handleToolCall(toolCall: any, context: any) {
  const { name, args } = toolCall;
  const { supabaseClient, companyId, stakeholderId, userRole } = context;

  try {
    switch (name) {
      case 'coach_simulate_incentive':
        return await simulateIncentive(args, context);

      case 'coach_explain_realization':
        return await explainRealization(args, context);

      case 'coach_get_suggestions':
        return await getSuggestions(args, context);

      default:
        return new Response(JSON.stringify({ error: 'Unknown tool' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }
  } catch (error) {
    console.error('Tool call error:', error);
    return new Response(JSON.stringify({ error: 'Tool execution failed' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
}

async function simulateIncentive(args: any, context: any) {
  // Simplified simulation for MVP
  const { planId, quotaPercentage, mboPercentage } = args;

  return new Response(
    JSON.stringify({
      result: {
        planId,
        quotaPercentage,
        mboPercentage,
        estimatedPayout: 'Simulation en cours de développement (Phase 1 MVP)',
      },
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  );
}

async function explainRealization(args: any, context: any) {
  const { realizationId } = args;
  const { supabaseClient, stakeholderId, userRole } = context;

  // Check permissions
  const { data: realization } = await supabaseClient
    .from('incentive_results_v4')
    .select('*')
    .eq('id', realizationId)
    .single();

  if (!realization) {
    return new Response(JSON.stringify({ error: 'Realization not found' }), {
      status: 404,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Check if user has access
  if (userRole === 'employee' && realization.stakeholder_id !== stakeholderId) {
    return new Response(
      JSON.stringify({ error: 'FORBIDDEN: You cannot access this realization' }),
      { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  return new Response(JSON.stringify({ result: realization }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function getSuggestions(args: any, context: any) {
  const { contextType } = args;

  const suggestions =
    contextType === 'incentive'
      ? ['Simuler mon variable', 'Expliquer mes KPIs', 'Voir ma progression']
      : ['Voir mes grants', 'Calculer la valeur', 'Comprendre le vesting'];

  return new Response(JSON.stringify({ result: { suggestions } }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
